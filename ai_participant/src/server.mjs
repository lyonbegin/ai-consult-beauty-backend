import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const PORT = Number(process.env.PORT || 8080);
const WEBRTC_BASE_URL = String(process.env.WEBRTC_BASE_URL || 'https://webrtc-new.fly.dev').replace(/\/$/, '');
const AI_USER_ID = process.env.AI_USER_ID || 'doctor-2';
const AI_USER_NAME = process.env.AI_USER_NAME || 'AI언니';
const AI_PLATFORM_ROLE = process.env.AI_PLATFORM_ROLE || 'doctor';
const TEST_LOGIN_KEY = process.env.WEBRTC_TEST_LOGIN_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-transcribe';
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-6-luna';
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'coral';
const SYSTEM_PROMPT = process.env.AI_SYSTEM_PROMPT || [
  '당신은 영상통화방에서 음성으로 대화하는 AI언니입니다.',
  '사용자에게 한국어 존댓말로 자연스럽고 짧게 답하세요.',
  '현재 단계는 음성 왕복 기능 검증이 목적이므로 한 번에 1~3문장으로 답하세요.',
  '상대가 테스트 문장을 말하면 대화가 이어지도록 자연스럽게 응답하세요.'
].join(' ');

const agents = new Map();
const conversations = new Map();
let browser;

function json(res, status, body) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store'
  });
  res.end(text);
}

async function readJson(req, maxBytes = 12 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error('request body too large');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(text || '{}');
}

async function openAiJson(path, payload) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');
  const response = await fetch(`https://api.openai.com/v1${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenAI ${path}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function transcribeWebm(base64) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');
  const bytes = Buffer.from(base64, 'base64');
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'audio/webm' }), 'utterance.webm');
  form.append('model', OPENAI_TRANSCRIBE_MODEL);
  form.append('language', 'ko');
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenAI transcription: ${response.status} ${JSON.stringify(body)}`);
  return String(body.text || '').trim();
}

function extractResponseText(body) {
  if (typeof body.output_text === 'string' && body.output_text.trim()) return body.output_text.trim();
  const parts = [];
  for (const item of body.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

async function generateReply(consultationId, transcript) {
  const previousResponseId = conversations.get(consultationId)?.previousResponseId;
  const payload = {
    model: OPENAI_CHAT_MODEL,
    instructions: SYSTEM_PROMPT,
    input: transcript,
    reasoning: { effort: 'none' },
    max_output_tokens: 220
  };
  if (previousResponseId) payload.previous_response_id = previousResponseId;
  const body = await openAiJson('/responses', payload);
  const text = extractResponseText(body) || '네, 들었습니다. 계속 말씀해 주세요.';
  conversations.set(consultationId, { previousResponseId: body.id, updatedAt: Date.now() });
  return text;
}

async function synthesize(text) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: OPENAI_TTS_MODEL,
      voice: OPENAI_TTS_VOICE,
      input: text,
      response_format: 'mp3',
      instructions: '한국어 여성 상담자처럼 또렷하고 자연스럽게, 과장 없이 차분하게 말하세요.'
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenAI speech: ${response.status} ${detail}`);
  }
  return Buffer.from(await response.arrayBuffer()).toString('base64');
}

async function issueDevToken() {
  const headers = { 'content-type': 'application/json' };
  if (TEST_LOGIN_KEY) headers['x-test-login-key'] = TEST_LOGIN_KEY;
  const response = await fetch(`${WEBRTC_BASE_URL}/auth/dev-token`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId: AI_USER_ID, name: AI_USER_NAME, platformRole: AI_PLATFORM_ROLE })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.accessToken) {
    throw new Error(`dev-token failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body.accessToken;
}

async function getConsultation(token, consultationId) {
  const response = await fetch(`${WEBRTC_BASE_URL}/telemedicine/consultations/${encodeURIComponent(consultationId)}`, {
    headers: { authorization: `Bearer ${token}` }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`consultation lookup failed: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function ensureBrowser() {
  if (browser?.isConnected()) return browser;
  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream'
    ]
  });
  return browser;
}

async function joinAgent(consultationId) {
  for (const agent of agents.values()) {
    if (agent.consultationId === consultationId && agent.state !== 'closed') return agent;
  }
  const token = await issueDevToken();
  const consultation = await getConsultation(token, consultationId);
  const invited = (consultation.participants || []).some((p) => p.userId === AI_USER_ID);
  if (!invited && consultation.policy?.allowUnlistedParticipants !== true) {
    throw new Error(`AI participant '${AI_USER_ID}' is not invited. Add ${AI_USER_ID} to the consultation first.`);
  }

  const id = randomUUID();
  const state = {
    id,
    consultationId,
    token,
    consultation,
    createdAt: new Date().toISOString(),
    state: 'launching',
    lastEvent: null,
    transcript: null,
    reply: null,
    error: null,
    page: null
  };
  agents.set(id, state);

  const b = await ensureBrowser();
  const page = await b.newPage();
  state.page = page;
  page.on('console', (msg) => console.log(`[agent:${consultationId}] browser`, msg.type(), msg.text()));
  page.on('pageerror', (error) => {
    state.state = 'error';
    state.error = error.message;
    console.error(`[agent:${consultationId}] pageerror`, error);
  });
  page.on('close', () => {
    state.state = 'closed';
    state.page = null;
  });

  await page.goto(`http://127.0.0.1:${PORT}/agent.html?agentId=${encodeURIComponent(id)}`, { waitUntil: 'domcontentloaded' });
  state.state = 'starting';
  return state;
}

async function leaveAgent(id) {
  const state = agents.get(id);
  if (!state) return false;
  try { await state.page?.close(); } catch {}
  state.state = 'closed';
  state.page = null;
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, {
        ok: true,
        service: 'ai-unni-webrtc-participant',
        webrtcBaseUrl: WEBRTC_BASE_URL,
        aiUserId: AI_USER_ID,
        openaiConfigured: Boolean(OPENAI_API_KEY),
        activeAgents: [...agents.values()].filter((a) => !['closed', 'error'].includes(a.state)).length
      });
    }

    if (req.method === 'GET' && url.pathname === '/status') {
      return json(res, 200, {
        agents: [...agents.values()].map(({ page, token, consultation, ...safe }) => ({
          ...safe,
          consultationStatus: consultation?.status,
          mediaNodePublicUrl: consultation?.mediaNodePublicUrl || null
        }))
      });
    }

    if (req.method === 'POST' && url.pathname === '/join') {
      const body = await readJson(req);
      const consultationId = String(body.consultationId || '').trim();
      if (!consultationId) return json(res, 400, { ok: false, error: 'consultationId is required' });
      const agent = await joinAgent(consultationId);
      return json(res, 202, { ok: true, agentId: agent.id, consultationId, state: agent.state });
    }

    if (req.method === 'POST' && url.pathname === '/leave') {
      const body = await readJson(req);
      const id = String(body.agentId || '').trim();
      const ok = await leaveAgent(id);
      return json(res, ok ? 200 : 404, { ok });
    }

    if (req.method === 'GET' && url.pathname === '/agent.html') {
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>AI Unni Participant</title></head><body><pre id="status">starting</pre><script src="/agent.js"></script></body></html>`;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(html);
    }

    if (req.method === 'GET' && url.pathname === '/agent.js') {
      const js = await readFile(new URL('../dist/agent.js', import.meta.url));
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(js);
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/agent-config/')) {
      const id = decodeURIComponent(url.pathname.slice('/api/agent-config/'.length));
      const state = agents.get(id);
      if (!state) return json(res, 404, { error: 'unknown agent' });
      return json(res, 200, {
        agentId: id,
        consultationId: state.consultationId,
        token: state.token,
        apiBaseUrl: WEBRTC_BASE_URL,
        mediaBaseUrl: state.consultation.mediaNodePublicUrl || WEBRTC_BASE_URL,
        status: state.consultation.status,
        aiUserId: AI_USER_ID
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/event') {
      const body = await readJson(req);
      const state = agents.get(String(body.agentId || ''));
      if (state) {
        state.lastEvent = { at: new Date().toISOString(), type: body.type, data: body.data ?? null };
        if (body.type === 'ready') state.state = 'ready';
        if (body.type === 'rtc-connected') state.state = 'rtc-connected';
        if (body.type === 'error') { state.state = 'error'; state.error = String(body.data?.message || 'browser error'); }
      }
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/utterance') {
      const body = await readJson(req);
      const agentId = String(body.agentId || '');
      const state = agents.get(agentId);
      if (!state) return json(res, 404, { ok: false, error: 'unknown agent' });
      const startedAt = Date.now();
      const transcript = await transcribeWebm(String(body.audioBase64 || ''));
      state.transcript = transcript;
      if (!transcript) return json(res, 200, { ok: true, ignored: true, transcript: '' });
      const reply = await generateReply(state.consultationId, transcript);
      state.reply = reply;
      const audioBase64 = await synthesize(reply);
      const elapsedMs = Date.now() - startedAt;
      state.lastEvent = { at: new Date().toISOString(), type: 'reply', data: { transcript, reply, elapsedMs } };
      return json(res, 200, { ok: true, transcript, reply, audioBase64, mimeType: 'audio/mpeg', elapsedMs });
    }

    return json(res, 404, { error: 'not found' });
  } catch (error) {
    console.error(error);
    return json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`AI participant control server listening on :${PORT}`);
});

async function shutdown() {
  for (const state of agents.values()) {
    try { await state.page?.close(); } catch {}
  }
  try { await browser?.close(); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
