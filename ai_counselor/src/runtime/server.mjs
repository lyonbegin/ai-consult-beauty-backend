import http from 'node:http';
import { constants, generateKeyPairSync, privateDecrypt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CounselorSession } from '../core/session.mjs';
import {
  COUNSELOR_PRESETS,
  counselorProfileFingerprint,
  normalizeCounselorProfile,
} from '../core/profile.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, '../..');
const sessions = new Map();

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': type.startsWith('text/html') ? 'no-store' : 'no-cache',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('request body too large');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function openAIFile() {
  return String(process.env.OPENAI_API_KEY_FILE || '/data/openai_api_key');
}

function testLoginFile() {
  return String(process.env.TEST_LOGIN_KEY_FILE || '/data/test_login_key');
}

function bootstrapPrivateFile() {
  return String(process.env.BOOTSTRAP_PRIVATE_KEY_FILE || '/data/bootstrap-private.pem');
}

function bootstrapPublicFile() {
  return String(process.env.BOOTSTRAP_PUBLIC_KEY_FILE || '/data/bootstrap-public.pem');
}

function openAIConfigured() {
  return Boolean(String(process.env.OPENAI_API_KEY || '').trim()) || existsSync(openAIFile());
}

function webrtcKeyConfigured() {
  return Boolean(String(process.env.WEBRTC_TEST_LOGIN_KEY || process.env.TEST_LOGIN_KEY || '').trim()) || existsSync(testLoginFile());
}

function ensureBootstrapKeypair() {
  const privatePath = bootstrapPrivateFile();
  const publicPath = bootstrapPublicFile();
  if (existsSync(privatePath) && existsSync(publicPath)) {
    return readFileSync(publicPath, 'utf8');
  }

  mkdirSync(dirname(privatePath), { recursive: true });
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  writeFileSync(privatePath, privateKey, { encoding: 'utf8', mode: 0o600 });
  writeFileSync(publicPath, publicKey, { encoding: 'utf8', mode: 0o644 });
  return publicKey;
}

function bootstrapPrivateKeys() {
  const keys = [];
  const legacyB64 = String(process.env.BOOTSTRAP_PRIVATE_KEY_B64 || '').trim();
  if (legacyB64) {
    try { keys.push(Buffer.from(legacyB64, 'base64').toString('utf8')); } catch {}
  }
  ensureBootstrapKeypair();
  keys.push(readFileSync(bootstrapPrivateFile(), 'utf8'));
  return [...new Set(keys.filter(Boolean))];
}

function decryptBootstrapCiphertext(body) {
  const ciphertextB64 = String(body?.ciphertext || '').trim();
  if (!ciphertextB64) throw new Error('ciphertext is required');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  let lastError = null;
  for (const key of bootstrapPrivateKeys()) {
    try {
      return privateDecrypt(
        {
          key,
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha1',
        },
        ciphertext,
      ).toString('utf8').trim();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('unable to decrypt bootstrap ciphertext');
}

function persistSecret(target, value) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value, { encoding: 'utf8', mode: 0o600 });
}

async function bootstrapOpenAIKey(body) {
  if (openAIConfigured()) return { alreadyConfigured: true };
  let apiKey = decryptBootstrapCiphertext(body);
  if (!apiKey.startsWith('sk-')) throw new Error('decrypted OpenAI credential has invalid format');

  const validation = await fetch('https://api.openai.com/v1/models', {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!validation.ok) {
    apiKey = '';
    throw new Error(`OpenAI credential validation failed: HTTP ${validation.status}`);
  }

  persistSecret(openAIFile(), apiKey);
  apiKey = '';
  return { stored: true };
}

async function bootstrapWebRTCKey(body) {
  if (webrtcKeyConfigured()) return { alreadyConfigured: true };
  let key = decryptBootstrapCiphertext(body);
  if (!key) throw new Error('decrypted WebRTC credential is empty');

  const base = String(process.env.WEBRTC_BASE_URL || 'https://webrtc-new.fly.dev').replace(/\/$/, '');
  const validation = await fetch(`${base}/auth/dev-token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-test-login-key': key,
    },
    body: JSON.stringify({
      userId: process.env.AI_USER_ID || 'doctor-1',
      name: process.env.AI_USER_NAME || 'AI 상담사',
      platformRole: process.env.AI_PLATFORM_ROLE || 'doctor',
    }),
  });
  if (!validation.ok) {
    key = '';
    throw new Error(`WebRTC login credential validation failed: HTTP ${validation.status}`);
  }

  persistSecret(testLoginFile(), key);
  key = '';
  return { stored: true };
}

function getSession(sessionId, profile) {
  const normalized = normalizeCounselorProfile(profile);
  const fingerprint = counselorProfileFingerprint(normalized);
  const current = sessions.get(sessionId);
  if (current && current.fingerprint === fingerprint) return current.session;
  const session = new CounselorSession(normalized);
  sessions.set(sessionId, { fingerprint, session, touchedAt: Date.now() });
  return session;
}

async function fileResponse(res, path, contentType) {
  try {
    const body = await readFile(path);
    send(res, 200, body, contentType);
  } catch {
    send(res, 404, { error: 'not found' });
  }
}

export function startRuntimeServer(port) {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return send(res, 204, '');
      const url = new URL(req.url || '/', 'http://runtime.local');

      if (req.method === 'GET' && url.pathname === '/health') {
        return send(res, 200, {
          ok: true,
          service: 'ai-counselor-runtime',
          sdkVersion: '0.2.0',
          openaiConfigured: openAIConfigured(),
          webrtcKeyConfigured: webrtcKeyConfigured(),
        });
      }

      if (req.method === 'GET' && url.pathname === '/internal/bootstrap/public-key') {
        return send(res, 200, {
          algorithm: 'RSA-OAEP-SHA1',
          publicKey: ensureBootstrapKeypair(),
          openaiConfigured: openAIConfigured(),
          webrtcKeyConfigured: webrtcKeyConfigured(),
        });
      }

      if (req.method === 'GET' && url.pathname === '/v1/presets') {
        return send(res, 200, COUNSELOR_PRESETS);
      }

      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/playground')) {
        return fileResponse(res, join(root, 'public/index.html'), 'text/html; charset=utf-8');
      }

      if (req.method === 'GET' && url.pathname === '/styles.css') {
        return fileResponse(res, join(root, 'public/styles.css'), 'text/css; charset=utf-8');
      }

      if (req.method === 'GET' && url.pathname === '/sdk/ai-counselor.esm.js') {
        return fileResponse(res, join(root, 'dist/sdk/ai-counselor.esm.js'), 'text/javascript; charset=utf-8');
      }

      if (req.method === 'POST' && url.pathname === '/internal/bootstrap/openai') {
        return send(res, 200, { ok: true, ...await bootstrapOpenAIKey(await readJson(req)) });
      }

      if (req.method === 'POST' && url.pathname === '/internal/bootstrap/webrtc') {
        return send(res, 200, { ok: true, ...await bootstrapWebRTCKey(await readJson(req)) });
      }

      if (req.method === 'POST' && url.pathname === '/v1/respond') {
        const body = await readJson(req);
        const sessionId = String(body.sessionId || '').trim();
        if (!sessionId) return send(res, 400, { error: 'sessionId is required' });
        const session = getSession(sessionId, body.profile || {});
        const result = await session.respond(body.text, body.context || {});
        const state = sessions.get(sessionId);
        if (state) state.touchedAt = Date.now();
        return send(res, 200, {
          ...result,
          sessionId,
          trace: {
            domain: result.profile.domain,
            role: result.profile.role,
            tools: result.profile.tools,
            model: session.chatModel,
          },
        });
      }

      if (req.method === 'POST' && url.pathname === '/v1/session/reset') {
        const body = await readJson(req);
        sessions.delete(String(body.sessionId || ''));
        return send(res, 200, { ok: true });
      }

      return send(res, 404, { error: 'not found' });
    } catch (error) {
      console.error('[runtime-http]', error instanceof Error ? error.message : String(error));
      return send(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[runtime-http] listening on :${port}`);
  });

  return server;
}
