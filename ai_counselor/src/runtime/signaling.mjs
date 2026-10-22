import { readFileSync } from 'node:fs';
import { io } from 'socket.io-client';
import {
  AI_PLATFORM_ROLE,
  AI_USER_ID,
  AI_USER_NAME,
  TEST_LOGIN_KEY,
  TEST_LOGIN_KEY_FILE,
  WEBRTC_BASE_URL,
} from './config.mjs';

function resolveTestLoginKey() {
  if (TEST_LOGIN_KEY) return TEST_LOGIN_KEY;
  if (!TEST_LOGIN_KEY_FILE) return '';
  try {
    return readFileSync(TEST_LOGIN_KEY_FILE, 'utf8').trim();
  } catch {
    return '';
  }
}

export async function apiRequest(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (path === '/auth/dev-token') {
    const testLoginKey = resolveTestLoginKey();
    if (testLoginKey) headers['x-test-login-key'] = testLoginKey;
  }

  const response = await fetch(`${WEBRTC_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

export async function issueToken() {
  const result = await apiRequest('/auth/dev-token', {
    method: 'POST',
    body: { userId: AI_USER_ID, name: AI_USER_NAME, platformRole: AI_PLATFORM_ROLE },
  });
  if (!result?.accessToken) throw new Error('dev-token response did not contain accessToken');
  return result.accessToken;
}

export async function listConsultations(token) {
  return apiRequest('/telemedicine/consultations/me', { token });
}

export async function createConsultation(token, input) {
  return apiRequest('/telemedicine/consultations', { method: 'POST', token, body: input });
}

export function createSocket(baseUrl, token) {
  return io(`${String(baseUrl).replace(/\/$/, '')}/realtime`, {
    transports: ['websocket'],
    auth: { token },
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
  });
}

export function waitForSocketReady(socket, timeoutMs = 15000) {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('realtime connection timeout')); }, timeoutMs);
    const onReady = () => { cleanup(); resolve(); };
    const onError = (payload) => { cleanup(); reject(new Error(payload?.message || 'realtime auth failed')); };
    const onConnectError = (error) => { cleanup(); reject(error); };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('connection:ready', onReady);
      socket.off('connection:error', onError);
      socket.off('connect_error', onConnectError);
    };
    socket.once('connection:ready', onReady);
    socket.once('connection:error', onError);
    socket.once('connect_error', onConnectError);
    socket.connect();
  });
}

export function emitAck(socket, event, payload, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(event, payload, (timeoutError, response) => {
      if (timeoutError) return reject(new Error(`${event} timeout`));
      if (!response || response.ok !== true) {
        return reject(new Error(response?.error?.message || `${event} failed`));
      }
      resolve(response.data);
    });
  });
}
