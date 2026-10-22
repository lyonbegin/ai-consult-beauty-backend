import { Device } from 'mediasoup-client';
import { WrtcHandler } from 'mediasoup-client-wrtc';
import * as wrtc from '@roamhq/wrtc';
import { AI_USER_ID } from './config.mjs';
import { AudioOutput, UtteranceCollector, createAudioSink } from './audio.mjs';
import { Brain } from './brain.mjs';
import { emitAck } from './signaling.mjs';

export class RtcClient {
  constructor(socket, sessionId) {
    this.socket = socket;
    this.sessionId = sessionId;
    this.device = null;
    this.sendTransport = null;
    this.recvTransport = null;
    this.output = null;
    this.outputProducer = null;
    this.brain = null;
    this.consumers = new Map();
    this.sinks = new Map();
    this.collectors = new Map();
    this.pending = new Map();
    this.consuming = new Set();
    this.started = false;
    this.disposed = false;

    this.onNewProducer = (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      void this.consumeDescriptor(payload).catch((error) => {
        console.error(`[${this.sessionId}] consume new producer failed`, error);
      });
    };

    this.onProducerClosed = (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      this.removeConsumer(payload.producerId);
    };
  }

  async start() {
    if (this.started || this.disposed) return;
    this.started = true;
    this.socket.on('rtc:new-producer', this.onNewProducer);
    this.socket.on('rtc:producer-closed', this.onProducerClosed);

    try {
      const joined = await emitAck(this.socket, 'rtc:join', {
        sessionId: this.sessionId,
        resume: false,
      });

      const handlerFactory = WrtcHandler.createFactory(wrtc);
      this.device = new Device({ handlerFactory });
      await this.device.load({ routerRtpCapabilities: joined.routerRtpCapabilities });

      await this.createRecvTransport();
      await this.createSendTransport();
      await this.publishOutputTrack();

      for (const descriptor of joined.existingProducers || []) {
        await this.consumeDescriptor(descriptor).catch((error) => {
          console.warn(`[${this.sessionId}] consume existing failed`, error.message);
        });
      }

      const current = await emitAck(this.socket, 'rtc:list-producers', {
        sessionId: this.sessionId,
      });
      for (const descriptor of current.producers || []) {
        await this.consumeDescriptor(descriptor).catch((error) => {
          console.warn(`[${this.sessionId}] consume sync failed`, error.message);
        });
      }

      for (const descriptor of this.pending.values()) {
        await this.consumeDescriptor(descriptor).catch(() => undefined);
      }
      this.pending.clear();
      console.log(`[${this.sessionId}] RTC connected as ${AI_USER_ID}`);
    } catch (error) {
      this.started = false;
      await this.dispose().catch(() => undefined);
      throw error;
    }
  }

  async createRecvTransport() {
    const result = await emitAck(this.socket, 'rtc:create-transport', {
      sessionId: this.sessionId,
      direction: 'recv',
    });
    const transport = this.device.createRecvTransport(result.transportOptions);

    transport.on('connect', ({ dtlsParameters }, callback, errback) => {
      emitAck(this.socket, 'rtc:connect-transport', {
        sessionId: this.sessionId,
        transportId: transport.id,
        dtlsParameters,
      }).then(() => callback()).catch(errback);
    });

    this.recvTransport = transport;
  }

  async createSendTransport() {
    const result = await emitAck(this.socket, 'rtc:create-transport', {
      sessionId: this.sessionId,
      direction: 'send',
    });
    const transport = this.device.createSendTransport(result.transportOptions);

    transport.on('connect', ({ dtlsParameters }, callback, errback) => {
      emitAck(this.socket, 'rtc:connect-transport', {
        sessionId: this.sessionId,
        transportId: transport.id,
        dtlsParameters,
      }).then(() => callback()).catch(errback);
    });

    transport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
      emitAck(this.socket, 'rtc:produce', {
        sessionId: this.sessionId,
        transportId: transport.id,
        kind,
        rtpParameters,
        appData,
      }).then((producer) => callback({ id: producer.producerId })).catch(errback);
    });

    this.sendTransport = transport;
  }

  async publishOutputTrack() {
    this.output = new AudioOutput();
    this.brain = new Brain(this.sessionId, this.output);
    this.outputProducer = await this.sendTransport.produce({
      track: this.output.track,
      appData: { source: 'microphone', participantType: 'AI' },
      codecOptions: { opusStereo: false, opusDtx: true },
    });
  }

  async consumeDescriptor(descriptor) {
    if (
      this.disposed ||
      descriptor.kind !== 'audio' ||
      descriptor.userId === AI_USER_ID
    ) return;

    if (
      this.consumers.has(descriptor.producerId) ||
      this.consuming.has(descriptor.producerId)
    ) return;

    if (!this.recvTransport || !this.device || !this.brain) {
      this.pending.set(descriptor.producerId, descriptor);
      return;
    }

    this.consuming.add(descriptor.producerId);
    try {
      const result = await emitAck(this.socket, 'rtc:consume', {
        sessionId: this.sessionId,
        transportId: this.recvTransport.id,
        producerId: descriptor.producerId,
        rtpCapabilities: this.device.rtpCapabilities,
      });

      const data = result.consumer;
      const consumer = await this.recvTransport.consume({
        id: data.id,
        producerId: data.producerId,
        kind: data.kind,
        rtpParameters: data.rtpParameters,
        appData: data.appData,
      });
      this.consumers.set(descriptor.producerId, consumer);

      const collector = new UtteranceCollector(({ wav, durationMs }) => {
        this.brain.submit(descriptor.userId, wav, durationMs);
      });
      const sink = createAudioSink(
        consumer.track,
        (audioData) => collector.push(audioData),
      );

      this.collectors.set(descriptor.producerId, collector);
      this.sinks.set(descriptor.producerId, sink);

      consumer.on('transportclose', () => this.removeConsumer(descriptor.producerId));
      consumer.on('producerclose', () => this.removeConsumer(descriptor.producerId));

      await emitAck(this.socket, 'rtc:resume-consumer', {
        sessionId: this.sessionId,
        consumerId: consumer.id,
      });

      console.log(`[${this.sessionId}] consuming audio from ${descriptor.userId}`);
    } finally {
      this.consuming.delete(descriptor.producerId);
      this.pending.delete(descriptor.producerId);
    }
  }

  removeConsumer(producerId) {
    this.pending.delete(producerId);

    const collector = this.collectors.get(producerId);
    try { collector?.finish(); } catch {}
    this.collectors.delete(producerId);

    const sink = this.sinks.get(producerId);
    try { sink?.stop(); } catch {}
    this.sinks.delete(producerId);

    const consumer = this.consumers.get(producerId);
    try { consumer?.close(); } catch {}
    this.consumers.delete(producerId);
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;

    this.socket.off('rtc:new-producer', this.onNewProducer);
    this.socket.off('rtc:producer-closed', this.onProducerClosed);

    for (const producerId of [...this.consumers.keys()]) {
      this.removeConsumer(producerId);
    }

    if (this.outputProducer) {
      try {
        await emitAck(this.socket, 'rtc:close-producer', {
          sessionId: this.sessionId,
          producerId: this.outputProducer.id,
        }, 3000);
      } catch {}
      try { this.outputProducer.close(); } catch {}
    }

    this.output?.stop();

    for (const transport of [this.sendTransport, this.recvTransport]) {
      if (!transport) continue;
      try {
        await emitAck(this.socket, 'rtc:close-transport', {
          sessionId: this.sessionId,
          transportId: transport.id,
        }, 3000);
      } catch {}
      try { transport.close(); } catch {}
    }
  }
}
