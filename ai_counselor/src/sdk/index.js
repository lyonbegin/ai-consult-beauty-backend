export const AI_COUNSELOR_SDK_VERSION = '0.1.0';

export const counselorPresets = Object.freeze({
  generic: {
    preset: 'generic',
    domain: 'general',
    name: 'AI 상담사',
    role: '범용 인공지능 상담사',
    objective: '사용자의 요구를 정확히 파악하고 필요한 다음 행동을 안내한다.',
    instructions: [],
    tools: [],
  },
  beauty: {
    preset: 'beauty',
    domain: 'beauty-dermatology',
    name: 'AI언니',
    role: '피부·미용 상담사',
    objective: '피부·미용 고민을 구조화하고 적절한 다음 단계를 설명한다.',
    instructions: [],
    tools: ['procedures', 'clinics', 'offers', 'reviews', 'booking'],
  },
});

function cleanEndpoint(value) {
  const raw = value || (typeof location !== 'undefined' ? location.origin : '');
  return String(raw).replace(/\/$/, '');
}

function randomSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class AICounselor {
  static create(options = {}) {
    return new AICounselor(options);
  }

  constructor({ endpoint, profile = counselorPresets.generic, sessionId } = {}) {
    this.endpoint = cleanEndpoint(endpoint);
    this.profile = { ...profile };
    this.sessionId = sessionId || randomSessionId();
  }

  configure(profile) {
    this.profile = { ...this.profile, ...(profile || {}) };
    return this;
  }

  getProfile() {
    return { ...this.profile };
  }

  async respond(text, context = {}) {
    const response = await fetch(`${this.endpoint}/v1/respond`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: this.sessionId,
        profile: this.profile,
        text,
        context,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.error || `AI Counselor runtime HTTP ${response.status}`);
    }
    return body;
  }

  async reset() {
    const response = await fetch(`${this.endpoint}/v1/session/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: this.sessionId }),
    });
    if (!response.ok) throw new Error(`reset failed: ${response.status}`);
    this.sessionId = randomSessionId();
  }
}
