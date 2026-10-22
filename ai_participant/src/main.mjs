import {
  AI_USER_ID,
  AI_USER_NAME,
  API_BASE_URL,
  AUTO_CREATE_ROOM,
  AUTO_PATIENT_ID,
  AUTO_PATIENT_NAME,
  AUTO_ROOM_TITLE,
  AUTO_START_ROOM,
  POLL_MS,
  TARGET_CONSULTATION_ID,
} from './config.mjs';
import {
  createConsultation,
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

  isHost() {
    return Array.isArray(this.session.hostUserIds) && this.session.hostUserIds.includes(AI_USER_ID);
  }

  async ensureStartedIfHost() {
    if (this.live || !AUTO_START_ROOM || !this.isHost() || this.closed) return;

    const started = await emitAck(this.socket, 'session:start', {
      sessionId: this.sessionId,
    });
    this.session = started.session;
    this.live = this.session.status === 'LIVE';
    console.log(`[${this.sessionId}] AI doctor started consultation; status=${this.session.status}`);
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

    const ready = await emitAck(this.socket, 'session:ready', {
      sessionId: this.sessionId,
      ready: true,
    });
    this.session = ready.session;
    this.live = this.session.status === 'LIVE';

    console.log(`[${this.sessionId}] AI doctor joined and ready; status=${this.session.status}`);

    if (!this.live) {
      await this.ensureStartedIfHost();
    }
    if (this.live) {
      await this.enterRtc();
    }
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

      try {
        const ready = await emitAck(this.socket, 'session:ready', {
          sessionId: this.sessionId,
          ready: true,
        });
        this.session = ready.session;
        this.live = this.session.status === 'LIVE';
      } catch {}

      const old = this.rtc;
      this.rtc = null;
      await old?.dispose().catch(() => undefined);

      if (!this.live) {
        await this.ensureStartedIfHost().catch((error) => {
          console.warn(`[${this.sessionId}] auto-start after reconnect failed: ${error.message}`);
        });
      }
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
      console.log(`[${this.sessionId}] AI doctor is inside RTC room and waiting`);
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

function active(session) {
  return Boolean(session?.id) && !['ENDED', 'CANCELLED'].includes(session.status);
}

function managed(session) {
  if (!active(session)) return false;
  if (TARGET_CONSULTATION_ID) return session.id === TARGET_CONSULTATION_ID;
  return (
    session.title === AUTO_ROOM_TITLE &&
    Array.isArray(session.hostUserIds) &&
    session.hostUserIds.includes(AI_USER_ID)
  );
}

async function ensureManagedSession(token) {
  const sessions = await listConsultations(token);
  const existing = sessions.find(managed);
  if (existing) return existing;

  if (TARGET_CONSULTATION_ID || !AUTO_CREATE_ROOM) return null;

  const created = await createConsultation(token, {
    title: AUTO_ROOM_TITLE,
    maxParticipants: 4,
    participants: [
      {
        userId: AI_USER_ID,
        displayName: AI_USER_NAME,
        role: 'DOCTOR',
      },
      {
        userId: AUTO_PATIENT_ID,
        displayName: AUTO_PATIENT_NAME,
        role: 'PATIENT',
      },
    ],
  });

  console.log(`[${created.id}] AI doctor created consultation "${created.title}" for ${AUTO_PATIENT_ID}`);
  return created;
}

async function reconcile(token) {
  const session = await ensureManagedSession(token);
  const desiredId = session?.id || null;

  for (const [sessionId, client] of rooms) {
    if (sessionId !== desiredId) {
      console.log(`[${sessionId}] leaving unmanaged consultation`);
      rooms.delete(sessionId);
      await client.close();
    }
  }

  if (!session || rooms.has(session.id)) return;

  console.log(`[${session.id}] managed consultation found; status=${session.status}`);
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

async function main() {
  console.log(`[boot] client-only AI doctor -> ${API_BASE_URL}`);
  console.log('[boot] no HTTP server, no SFU, no signaling server');
  const token = await issueToken();
  console.log(`[boot] AI doctor login succeeded as ${AI_USER_ID}`);

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
