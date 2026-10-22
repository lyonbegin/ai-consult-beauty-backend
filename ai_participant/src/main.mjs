import {
  API_BASE_URL,
  MAX_ACTIVE_ROOMS,
  POLL_MS,
  TARGET_CONSULTATION_ID,
} from './config.mjs';
import {
  createSocket,
  emitAck,
  issueToken,
  listConsultations,
  waitForSocketReady,
} from './signaling.mjs';
import { RtcClient } from './rtc.mjs';

class RoomClient {
  constructor(token, session) {
    this.token = token;
    this.session = session;
    this.sessionId = session.id;
    this.socket = null;
    this.rtc = null;
    this.closed = false;
    this.joined = false;
    this.live = session.status === 'LIVE';
    this.rejoining = false;
  }

  async start() {
    const base = this.session.mediaNodePublicUrl || API_BASE_URL;
    this.socket = createSocket(base, this.token);
    this.bindEvents();
    await waitForSocketReady(this.socket);

    const joined = await emitAck(this.socket, 'session:join', { sessionId: this.sessionId });
    this.joined = true;
    this.session = joined.session;
    this.live = this.session.status === 'LIVE';

    try {
      const ready = await emitAck(this.socket, 'session:ready', {
        sessionId: this.sessionId,
        ready: true,
      });
      this.session = ready.session;
      this.live = this.session.status === 'LIVE';
    } catch (error) {
      console.warn(`[${this.sessionId}] session:ready failed: ${error.message}`);
    }

    console.log(`[${this.sessionId}] AI signaling joined; status=${this.session.status}`);
    if (this.live) await this.enterRtc();
  }

  bindEvents() {
    this.socket.on('session:started', (payload) => {
      if (payload.session.id !== this.sessionId || this.closed) return;
      this.session = payload.session;
      this.live = true;
      void this.enterRtc().catch((error) => console.error(`[${this.sessionId}] RTC start failed`, error));
    });

    this.socket.on('session:ended', (payload) => {
      if (payload.session.id !== this.sessionId) return;
      this.session = payload.session;
      this.live = false;
      const old = this.rtc;
      this.rtc = null;
      void old?.dispose();
    });

    this.socket.on('connection:ready', () => {
      if (this.closed || !this.joined) return;
      void this.rejoinAfterReconnect().catch((error) => {
        console.error(`[${this.sessionId}] reconnect failed`, error);
      });
    });
  }

  async rejoinAfterReconnect() {
    if (this.rejoining || this.closed) return;
    this.rejoining = true;
    try {
      const joined = await emitAck(this.socket, 'session:join', { sessionId: this.sessionId });
      this.session = joined.session;
      this.live = this.session.status === 'LIVE';
      const old = this.rtc;
      this.rtc = null;
      await old?.dispose().catch(() => undefined);
      if (this.live) await this.enterRtc();
    } finally {
      this.rejoining = false;
    }
  }

  async enterRtc() {
    if (this.rtc || !this.live || this.closed) return;
    const rtc = new RtcClient(this.socket, this.sessionId);
    this.rtc = rtc;
    try {
      await rtc.start();
    } catch (error) {
      this.rtc = null;
      await rtc.dispose().catch(() => undefined);
      throw error;
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    const old = this.rtc;
    this.rtc = null;
    await old?.dispose().catch(() => undefined);

    if (this.socket?.connected && this.joined) {
      try {
        await emitAck(this.socket, 'session:leave', { sessionId: this.sessionId }, 3000);
      } catch {}
    }
    this.socket?.disconnect();
  }
}

const rooms = new Map();
let shuttingDown = false;

function isEligible(session) {
  if (!session?.id || ['ENDED', 'CANCELLED'].includes(session.status)) return false;
  if (TARGET_CONSULTATION_ID && session.id !== TARGET_CONSULTATION_ID) return false;
  return true;
}

async function reconcile(token) {
  const sessions = await listConsultations(token);
  const eligible = sessions.filter(isEligible).slice(0, MAX_ACTIVE_ROOMS);
  const desiredIds = new Set(eligible.map((session) => session.id));

  for (const [sessionId, client] of rooms) {
    if (!desiredIds.has(sessionId)) {
      console.log(`[${sessionId}] leaving inactive consultation`);
      rooms.delete(sessionId);
      await client.close();
    }
  }

  for (const session of eligible) {
    if (rooms.has(session.id)) continue;
    console.log(`[${session.id}] discovered consultation; status=${session.status}`);
    const client = new RoomClient(token, session);
    rooms.set(session.id, client);
    try {
      await client.start();
    } catch (error) {
      rooms.delete(session.id);
      await client.close().catch(() => undefined);
      console.error(`[${session.id}] join failed`, error);
    }
  }
}

async function main() {
  console.log(`[boot] client-only AI participant -> ${API_BASE_URL}`);
  console.log('[boot] no HTTP server, no SFU, no signaling server');
  const token = await issueToken();
  console.log('[boot] AI login succeeded');

  while (!shuttingDown) {
    try {
      await reconcile(token);
    } catch (error) {
      console.error('[poll] failed', error);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal}`);
  for (const client of rooms.values()) await client.close().catch(() => undefined);
  rooms.clear();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await main();
