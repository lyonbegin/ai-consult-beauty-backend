// Pure, cross-project profile composition. No WebRTC or provider dependency.
export const COUNSELOR_PRESETS = Object.freeze({
  generic: {domain:'general', name:'AI 상담사', role:'범용 인공지능 상담사', objective:'요구를 파악하고 적절한 안내를 제공한다.', instructions:['확인하지 못한 사실을 만들어내지 않는다.'],tools:[]},
  beauty: {domain:'beauty-dermatology',name:'AI언니',role:'피부·미용 상담사',objective:'피부·미용 상담 요구를 구조화하고 다음 행동을 안내한다.',instructions:['의학적 진단을 확정하지 않는다.'],tools:['procedures','clinics','booking']},
  'elderly-care': {domain:'elderly-care',name:'돌봄 상담사',role:'장기요양·통합돌봄 상담사',objective:'어르신과 보호자에게 필요한 돌봄을 파악한다.',instructions:['급여·기관 정보는 실제 제공된 자료를 바탕으로 안내한다.'],tools:['long-term-care','care-centers','welfare-equipment']},
  tutoring: {domain:'education',name:'AI 튜터',role:'개인 과외 상담사',objective:'학습자의 이해와 목표에 맞춰 설명한다.',instructions:['한 번에 한 개념씩 설명하고 이해도를 확인한다.'],tools:['curriculum','problems']},
  interview: {domain:'career-interview',name:'AI 면접관',role:'모의면접 상담사',objective:'모의면접과 구체적 피드백을 제공한다.',instructions:['질문은 한 번에 하나씩 한다.'],tools:['jobs','resume','interview-rubric']}
});
const string = (value,fallback='')=>typeof value==='string'&&value.trim()?value.trim():fallback;
const array = value=>Array.isArray(value)?value.map(x=>String(x).trim()).filter(Boolean):[];
const defaults = Object.freeze({language:'ko',voice:'coral',policy:{maxReplySentences:5,askBeforeAssuming:true,humanHandoffWhenUncertain:true}});
export function normalizeCounselorProfile(raw={}) {
  const input=typeof raw==='string'?{preset:raw}:raw||{};
  const preset=string(input.preset,'generic');
  const base=COUNSELOR_PRESETS[preset]||COUNSELOR_PRESETS.generic;
  const policy={...defaults.policy,...(base.policy||{}),...(input.policy||{})};
  const mergedTools=input.tools===undefined?array(base.tools):array(input.tools);
  const instructions=input.instructions===undefined?array(base.instructions):array(input.instructions);
  return {
    preset:COUNSELOR_PRESETS[preset]?preset:'custom',
    id:string(input.id,preset),
    domain:string(input.domain,base.domain),
    name:string(input.name,base.name),
    role:string(input.role,base.role),
    objective:string(input.objective,base.objective),
    language:string(input.language,defaults.language),
    voice:string(input.voice,defaults.voice),
    instructions:[...instructions,...array(input.additionalInstructions)],
    policy,
    tools:[...new Set(mergedTools)],
    knowledge:array(input.knowledge)
  };
}
export const counselorProfileFingerprint = profile=>JSON.stringify(normalizeCounselorProfile(profile));
export function buildCounselorInstructions(raw={}) {
  const p=normalizeCounselorProfile(raw);
  return [
    '당신은 다음 외부 설정으로 생성된 인공지능 상담사입니다.',
    '이름: '+p.name,
    '분야: '+p.domain,
    '역할: '+p.role,
    '목표: '+p.objective,
    '언어: '+p.language,
    ...p.instructions,
    '사용 가능한 도구 범주: '+(p.tools.join(', ')||'없음'),
    '참고 지식 소스: '+(p.knowledge.join(', ')||'없음'),
    '도구가 실제로 실행되지 않았다면 실행했다고 주장하지 마십시오.',
    '확인된 데이터 없이 예약·기관·가격·재고를 만들지 마십시오.',
    p.policy.askBeforeAssuming?'중요 정보가 빠졌으면 꼭 필요한 질문만 하십시오.':'',
    p.policy.humanHandoffWhenUncertain?'전문가 검토가 필요할 때는 상담 연계를 제안하십시오.':'',
    '일반 답변은 가능하면 '+p.policy.maxReplySentences+'문장 이내로 합니다.'
  ].filter(Boolean).join('\n');
}
