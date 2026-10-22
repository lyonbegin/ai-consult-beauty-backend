import {
  AI_USER_ID,
  AI_USER_NAME,
  AUTO_CREATE_ROOM,
  AUTO_PATIENT_ID,
  AUTO_PATIENT_NAME,
  AUTO_ROOM_TITLE,
  AUTO_START_ROOM,
  POLL_MS,
  TARGET_CONSULTATION_ID,
  WEBRTC_BASE_URL,
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

const rooms = new Map();
let stopping = false;

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
  }

  isHost() {
    return Array.isArray(this.session.hostUserIds) && this.session.hostUserIds.includes(AI_USER_ID);
  }

  async start() {
    this.socket = createSocket(this.session.mediaNodePublicUrl || WEBRTC_BASE_URL, this.token);
    await waitForSocketReady(this.socket);
    const joined = await emitAck(this.socket, 'session:join', { sessionId: this.sessionId });
    this.joined = true;
    this.session = joined.session;
    this.live = this.session.status === 'LIVE';

    const ready = await emitAck(this.socket, 'session:ready', { sessionId: this.sessionId, ready: true });
    this.session = ready.session;
    this.live = this.session.status === 'LIVE';
    console.log(`[${this.sessionId}] AI counselor joined; status=${this.session.status}`);

    if (!this.live && AUTO_START_ROOM && this.isHost()) {
      const started = await emitAck(this.socket, 'session:start', { sessionId: this.sessionId });
      this.session = started.session;
      this.live = this.session.status === 'LIVE';
      console.log(`[${this.sessionId}] AI counselor started room; status=${this.session.status}`);
    }
    if (this.live) await this.enterRtc();

    this.socket.on('session:started', (payload) => {
      if (payload.session.id !== this.sessionId || this.closed) return;
      this.session = payload.session;
      this.live = true;
      void this.enterRtc().catch((error) => console.error(`[${this.sessionId}] RTC start failed`, error));
    });
  }

  async enterRtc() {
    if (this.rtc || !this.live || this.closed) return;
    const rtc = new RtcClient(this.socket, this.sessionId);
    this.rtc = rtc;
    try {
      await rtc.start();
      console.log(`[${this.sessionId}] AI counselor is inside RTC room and waiting`);
    } catch (error) {
      this.rtc = null;
      await rtc.dispose().catch(() => undefined);
      throw error;
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    await this.rtc?.dispose().catch(() => undefined);
    if (this.socket?.connected && this.joined) {
      try { await emitAck(this.socket, 'session:leave', { sessionId: this.sessionId }, 3000); } catch {}
    }
    this.socket?.disconnect();
  }
}

function active(session) {
  return Boolean(session?.id) && !['ENDED', 'CANCELLED'].includes(session.status);
}

function managed(session) {
  if (!active(session)) return false;
  if (TARGET_CONSULTATION_ID) return session.id === TARGET_CONSULTATION_ID;
  return session.title === AUTO_ROOM_TITLE && session.hostUserIds?.includes(AI_USER_ID);
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
      { userId: AI_USER_ID, displayName: AI_USER_NAME, role: 'DOCTOR' },
      { userId: AUTO_PATIENT_ID, displayName: AUTO_PATIENT_NAME, role: 'PATIENT' },
    ],
  });
  console.log(`[${created.id}] AI counselor created room "${created.title}"`);
  return created;
}

async function reconcile(token) {
  const session = await ensureManagedSession(token);
  const desiredId = session?.id || null;
  for (const [sessionId, client] of rooms) {
    if (sessionId !== desiredId) {
      rooms.delete(sessionId);
      await client.close();
    }
  }
  if (!session || rooms.has(session.id)) return;

  console.log(`[${session.id}] counselor room found; status=${session.status}`);
  const client = new RoomClient(token, session);
  rooms.set(session.id, client);
  try {
    await client.start();
  } catch (error) {
    rooms.delete(session.id);
    await client.close().catch(() => undefined);
    console.error(`[${session.id}] counselor room join failed`, error);
  }
}

export async function runParticipant() {
  stopping = false;
  console.log(`[participant] outbound client -> ${WEBRTC_BASE_URL}`);
  const token = await issueToken();
  console.log(`[participant] login succeeded as ${AI_USER_ID}`);
  while (!stopping) {
    try { await reconcile(token); } catch (error) { console.error('[participant] poll failed', error); }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

export async function stopParticipant() {
  stopping = true;
  for (const client of rooms.values()) await client.close().catch(() => undefined);
  rooms.clear();
}

// Read-only public-room readiness information for the video consultation Playground.
// Never expose room tokens, patient identities, secrets or signaling auth.
export function getParticipantStatus(){
  return [...rooms.values()].map(client=>({
    roomId:client.sessionId,
    title:client.session?.title||'',
    status:client.session?.status||'UNKNOWN',
    joined:Boolean(client.joined&&!client.closed),
    live:Boolean(client.live),
    rtcConnected:Boolean(client.rtc?.started&&!client.rtc?.disposed),
  }));
}
