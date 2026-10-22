export const COUNSELOR_PRESETS = Object.freeze({
  generic: {
    id: 'generic',
    domain: 'general',
    name: 'AI 상담사',
    role: '범용 인공지능 상담사',
    objective: '사용자의 요구를 정확히 파악하고 필요한 다음 행동을 안내한다.',
    language: 'ko',
    voice: 'coral',
    instructions: [
      '사용자의 말을 먼저 이해하고 필요한 경우 한 번에 하나씩 질문한다.',
      '근거가 없는 사실을 만들어내지 않는다.',
      '외부 도구가 필요한 업무는 사용 가능 도구 이름을 기준으로 판단한다.',
    ],
    policy: {
      maxReplySentences: 4,
      askBeforeAssuming: true,
      humanHandoffWhenUncertain: true,
    },
    tools: [],
  },
  beauty: {
    id: 'beauty',
    domain: 'beauty-dermatology',
    name: 'AI언니',
    role: '피부·미용 상담사',
    objective: '피부·미용 고민을 구조화하고 적절한 시술·병원 상담의 다음 단계를 설명한다.',
    language: 'ko',
    voice: 'coral',
    instructions: [
      '피부 고민의 위치, 기간, 증상, 사용 중인 제품이나 시술 이력을 필요한 순서대로 파악한다.',
      '진단을 확정하지 말고 상담·진료에 도움이 되는 정보를 제공한다.',
      '시술이나 병원 정보는 연결된 도구가 제공한 정보만 근거로 설명한다.',
    ],
    policy: {
      maxReplySentences: 4,
      askBeforeAssuming: true,
      humanHandoffWhenUncertain: true,
    },
    tools: ['procedures', 'clinics', 'offers', 'reviews', 'booking'],
  },
});

function strings(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

export function normalizeCounselorProfile(input = {}) {
  const presetName = String(input.preset || input.id || 'generic');
  const base = COUNSELOR_PRESETS[presetName] || COUNSELOR_PRESETS.generic;
  const policy = { ...base.policy, ...(input.policy || {}) };
  return {
    id: String(input.id || base.id || presetName),
    domain: String(input.domain || base.domain || 'general'),
    name: String(input.name || base.name || 'AI 상담사'),
    role: String(input.role || base.role || '인공지능 상담사'),
    objective: String(input.objective || base.objective || ''),
    language: String(input.language || base.language || 'ko'),
    voice: String(input.voice || base.voice || 'coral'),
    instructions: strings(input.instructions).length ? strings(input.instructions) : [...(base.instructions || [])],
    policy,
    tools: [...new Set(strings(input.tools).length ? strings(input.tools) : [...(base.tools || [])])],
  };
}

export function counselorProfileFingerprint(profile) {
  return JSON.stringify(normalizeCounselorProfile(profile));
}

export function buildCounselorInstructions(profileInput) {
  const profile = normalizeCounselorProfile(profileInput);
  const lines = [
    `당신의 이름은 "${profile.name}"입니다.`,
    `당신의 역할은 "${profile.role}"입니다.`,
    `상담 분야(domain)는 "${profile.domain}"입니다.`,
    `상담 목표는 "${profile.objective}"입니다.`,
    `기본 응답 언어는 "${profile.language}"입니다.`,
    '사용자에게 자연스럽고 전문적인 상담을 제공하십시오.',
    ...profile.instructions,
  ];
  if (profile.tools.length) {
    lines.push(`이 상담사에 연결될 수 있는 도구 범주는 다음과 같습니다: ${profile.tools.join(', ')}.`);
    lines.push('도구로 확인하지 않은 구체적인 가격·재고·예약·기관 정보는 만들어내지 마십시오.');
  }
  if (profile.policy?.askBeforeAssuming) {
    lines.push('중요한 정보가 빠졌다면 추측 대신 필요한 질문을 먼저 하십시오.');
  }
  const max = Number(profile.policy?.maxReplySentences || 4);
  lines.push(`일반 답변은 가능하면 ${max}문장 이내로 간결하게 하십시오.`);
  return lines.join('\n');
}
