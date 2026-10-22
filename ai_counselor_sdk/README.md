# AI Counselor SDK v1 — 범용 인공지능 상담사 SDK

독립 패키지 경로: `ai_counselor_sdk/`. 이전 `ai_counselor/`와 분리됩니다.

## 분리 원칙
- **Reusable SDK**: 프런트 프로젝트가 domain/name/role/objective/instructions/policy/tools/knowledge 주입
- **Runtime**: OpenAI Responses / transcription / speech 실행 (OpenAI 자격증명 서버에만)
- **WebRTC participant adapter**: 기존 `https://webrtc-new.fly.dev`에 일반 클라이언트로 접속. 서버/SFU/signaling 개조 금지
- **Playground**: 실제 배포된 `/sdk/ai-counselor.esm.js` import
- **Preset**: generic, beauty, elderly-care, tutoring, interview; 기본은 generic
- **Tools**: 선언하는 이름은 연결 가능 목록이며, 실제 실행은 별도 프로젝트 어댑터 구현이 필요

## SDK 사용
```js
import { AICounselor } from 'https://<runtime>/sdk/ai-counselor.esm.js';
const agent = AICounselor.create({
  endpoint: 'https://<runtime>',
  accessToken: '<authorized runtime token>',
  profile: {
    preset: 'elderly-care', domain: 'elderly-care',
    name: '요양 AI', role: '장기요양 상담사',
    objective: '수급자와 보호자의 돌봄 요구를 구조화한다',
    tools: ['care-centers','welfare-equipment']
  }
});
console.log((await agent.respond('가족요양을 알아보고 있어요')).text);
```

## Runtime
`npm install && npm run build && npm start`. Docker build에서 문법 검사, 단위테스트, SDK ESM 빌드를 실행합니다.

설정: `OPENAI_API_KEY_FILE=/data/openai_api_key`, `TEST_LOGIN_KEY_FILE=/data/test_login_key`,
`OPENAI_CHAT_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, `OPENAI_TTS_MODEL`, `RUNTIME_API_TOKEN` (API 필수 인증),
`COUNSELOR_PRESET=generic`, `COUNSELOR_PROFILE_JSON`, `PARTICIPANT_ENABLED=false` (실제 음성 검증 시 true),
`WEBRTC_BASE_URL=https://webrtc-new.fly.dev`, `AI_USER_ID`, `AI_USER_NAME`,
`AUTO_CREATE_ROOM`, `AUTO_START_ROOM`.

Endpoints: GET /health, /v1/presets, /sdk/ai-counselor.esm.js, /playground; POST /v1/respond, /v1/session/reset.

## 운영 전 확인
1. /health, /v1/presets, SDK, Playground HTTP 200.
2. OpenAI 및 WebRTC 비밀값은 Railway Volume 또는 비밀 환경변수로 설정.
3. API 모델 실제 호출, 도메인 변경 응답 테스트.
4. 이후 WebRTC participant 켜고 doctor-1 로그온/방 접속, patient-1 음성 STT→LLM→TTS 실제 왕복 테스트.
5. 여기까지 검증된 뒤에만 Fly의 `ai-unni-participant` 제거. `webrtc-new` 삭제 금지.
