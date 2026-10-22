import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const wrtc = require('@roamhq/wrtc');
import {
  VAD_END_SILENCE_MS,
  VAD_MAX_SPEECH_MS,
  VAD_MIN_SPEECH_MS,
  VAD_RMS_THRESHOLD,
} from './config.mjs';

function rms(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i] / 32768;
    sum += value * value;
  }
  return Math.sqrt(sum / samples.length);
}

function toMono(data) {
  const channelCount = Math.max(1, Number(data.channelCount || 1));
  const input = data.samples;
  if (channelCount === 1) return new Int16Array(input);
  const frames = Math.floor(input.length / channelCount);
  const mono = new Int16Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let total = 0;
    for (let channel = 0; channel < channelCount; channel += 1) {
      total += input[frame * channelCount + channel];
    }
    mono[frame] = Math.max(-32768, Math.min(32767, Math.round(total / channelCount)));
  }
  return mono;
}

function concatInt16(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Int16Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function makeWav(samples, sampleRate) {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0, 4, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 4, 'ascii');
  buffer.write('fmt ', 12, 4, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 4, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i += 1) buffer.writeInt16LE(samples[i], 44 + i * 2);
  return buffer;
}

export class UtteranceCollector {
  constructor(onUtterance) {
    this.onUtterance = onUtterance;
    this.preRoll = [];
    this.active = false;
    this.frames = [];
    this.sampleRate = 48000;
    this.speechMs = 0;
    this.silenceMs = 0;
    this.hotFrames = 0;
  }

  push(data) {
    const sampleRate = Number(data.sampleRate || 48000);
    const mono = toMono(data);
    const frameMs = Math.max(1, Math.round((mono.length / sampleRate) * 1000));
    const hot = rms(mono) >= VAD_RMS_THRESHOLD;

    this.preRoll.push(mono);
    while (this.preRoll.length > 20) this.preRoll.shift();

    if (!this.active) {
      this.hotFrames = hot ? this.hotFrames + 1 : 0;
      if (this.hotFrames >= 3) {
        this.active = true;
        this.sampleRate = sampleRate;
        this.frames = [...this.preRoll];
        this.speechMs = this.frames.reduce((ms, frame) => ms + Math.round((frame.length / sampleRate) * 1000), 0);
        this.silenceMs = 0;
      }
      return;
    }

    this.frames.push(mono);
    this.speechMs += frameMs;
    this.silenceMs = hot ? 0 : this.silenceMs + frameMs;

    if (
      this.speechMs >= VAD_MAX_SPEECH_MS ||
      (this.speechMs >= VAD_MIN_SPEECH_MS && this.silenceMs >= VAD_END_SILENCE_MS)
    ) {
      this.finish();
    }
  }

  finish() {
    if (!this.active || this.frames.length === 0) return;
    const samples = concatInt16(this.frames);
    const durationMs = Math.round((samples.length / this.sampleRate) * 1000);
    this.active = false;
    this.frames = [];
    this.preRoll = [];
    this.speechMs = 0;
    this.silenceMs = 0;
    this.hotFrames = 0;
    if (durationMs >= VAD_MIN_SPEECH_MS) {
      void this.onUtterance({ wav: makeWav(samples, this.sampleRate), durationMs });
    }
  }
}

export class AudioOutput {
  constructor() {
    this.source = new wrtc.nonstandard.RTCAudioSource();
    this.track = this.source.createTrack();
    this.queue = [];
    this.offset = 0;
    this.silence = new Int16Array(480);
    this.timer = setInterval(() => this.tick(), 10);
  }

  enqueuePcm24k(buffer) {
    const count = Math.floor(buffer.length / 2);
    const src = new Int16Array(count);
    for (let i = 0; i < count; i += 1) src[i] = buffer.readInt16LE(i * 2);

    const upsampled = new Int16Array(src.length * 2);
    for (let i = 0; i < src.length; i += 1) {
      const current = src[i];
      const next = i + 1 < src.length ? src[i + 1] : current;
      upsampled[i * 2] = current;
      upsampled[i * 2 + 1] = Math.round((current + next) / 2);
    }
    this.queue.push(upsampled);
  }

  tick() {
    const frame = new Int16Array(480);
    let written = 0;
    while (written < frame.length && this.queue.length > 0) {
      const head = this.queue[0];
      const available = head.length - this.offset;
      const take = Math.min(frame.length - written, available);
      frame.set(head.subarray(this.offset, this.offset + take), written);
      written += take;
      this.offset += take;
      if (this.offset >= head.length) {
        this.queue.shift();
        this.offset = 0;
      }
    }
    this.source.onData({
      samples: written > 0 ? frame : this.silence,
      sampleRate: 48000,
      bitsPerSample: 16,
      channelCount: 1,
      numberOfFrames: 480,
    });
  }

  stop() {
    clearInterval(this.timer);
    this.queue.length = 0;
    try { this.track.stop(); } catch {}
  }
}

export function createAudioSink(track, onData) {
  const sink = new wrtc.nonstandard.RTCAudioSink(track);
  sink.ondata = onData;
  return {
    stop() {
      try { sink.stop(); } catch {}
      sink.ondata = undefined;
    },
  };
}
