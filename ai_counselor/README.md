# AI Counselor SDK

범용 인공지능 상담사 코어 + 브라우저 SDK + WebRTC participant adapter + Playground입니다.

## 핵심 원칙
- 상담 분야를 코어에 하드코딩하지 않습니다.
- 프로젝트가 `domain`, `role`, `objective`, `instructions`, `tools`, `policy`를 전달합니다.
- AI언니는 `beauty` preset일 뿐입니다.
- Playground는 배포 산출물 `/sdk/ai-counselor.esm.js`를 직접 import합니다.
- WebRTC adapter는 기존 `https://webrtc-new.fly.dev`에 outbound client로만 붙습니다. 기존 WebRTC 서버는 수정하지 않습니다.

## SDK 예
```js
import { AICounselor } from '/sdk/ai-counselor.esm.js';

const counselor = AICounselor.create({
  endpoint: 'https://<runtime>',
  profile: {
    domain: 'elderly-care',
    role: '장기요양 상담사',
    objective: '수급자와 보호자의 돌봄 요구를 구조화한다.',
    tools: ['care-centers', 'welfare-equipment']
  }
});

const result = await counselor.respond('가족요양을 알아보고 있어요');
console.log(result.text);
```

## Runtime 환경변수
- `OPENAI_API_KEY`
- `OPENAI_CHAT_MODEL` (기본 `gpt-5.6-sol`)
- `OPENAI_TRANSCRIBE_MODEL` (기본 `gpt-transcribe`)
- `OPENAI_TTS_MODEL` (기본 `gpt-4o-mini-tts`)
- `COUNSELOR_PRESET` (기본 `beauty`)
- `COUNSELOR_PROFILE_JSON` (preset override)
- `PARTICIPANT_ENABLED`
- `WEBRTC_BASE_URL`
- `TEST_LOGIN_KEY` 또는 `WEBRTC_TEST_LOGIN_KEY`
- `AI_USER_ID`, `AI_USER_NAME`

## Endpoints
- `GET /health`
- `GET /playground`
- `GET /sdk/ai-counselor.esm.js`
- `GET /v1/presets`
- `POST /v1/respond`
- `POST /v1/session/reset`


## 기본 프리셋
- `generic`: 범용 상담사
- `beauty`: AI언니 피부·미용 상담사
- `elderly-care`: 장기요양·통합돌봄 상담사
- `tutoring`: 개인 과외 상담사
- `interview`: 취업·모의면접 상담사

프리셋은 예시일 뿐이며 모든 프로젝트는 `domain`, `role`, `objective`, `instructions`, `tools`, `policy`를 외부에서 덮어써서 동일 SDK를 재사용할 수 있습니다.
