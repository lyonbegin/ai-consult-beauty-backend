export const AI_COUNSELOR_SDK_VERSION = '0.2.0';

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
  'elderly-care': {
    preset: 'elderly-care',
    domain: 'elderly-care',
    name: '돌봄 상담사',
    role: '장기요양·통합돌봄 상담사',
    objective: '어르신과 보호자의 돌봄 요구를 구조화하고 적합한 서비스 탐색의 다음 단계를 안내한다.',
    instructions: [],
    tools: ['care-centers', 'welfare-equipment', 'long-term-care', 'booking'],
  },
  tutoring: {
    preset: 'tutoring',
    domain: 'education-tutoring',
    name: 'AI 튜터',
    role: '개인 과외 상담사',
    objective: '학습자의 목표와 현재 수준을 파악하고 학습 계획과 다음 학습 행동을 안내한다.',
    instructions: [],
    tools: ['curriculum', 'problems', 'tutors', 'scheduling'],
  },
  interview: {
    preset: 'interview',
    domain: 'career-interview',
    name: 'AI 면접관',
    role: '취업·모의면접 상담사',
    objective: '지원 직무와 경력을 바탕으로 모의면접을 진행하고 구체적인 개선 피드백을 제공한다.',
    instructions: [],
    tools: ['jobs', 'company-info', 'resume', 'interview-rubric'],
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

  usePreset(name, overrides = {}) {
    const preset = counselorPresets[name];
    if (!preset) throw new Error(`Unknown counselor preset: ${name}`);
    this.profile = { ...preset, ...overrides };
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
