# AI Unni WebRTC Participant

A standalone AI participant for the existing `webrtc-new.fly.dev` mediasoup consultation rooms.

## First milestone

`remote WebRTC audio -> speech-to-text -> OpenAI Responses API -> text-to-speech -> WebRTC audio publish`

No camera analysis, no medical RAG, no LangGraph, and no GPT-Live are used in this first milestone.

## Existing test convention

The current telemedicine frontend already supports a consulting doctor account `doctor-2`. For the first test, create a consultation with `doctor-2` in **협진 의사 ID**. The AI service logs in as that participant by default.

## Required environment

- `OPENAI_API_KEY`
- `WEBRTC_BASE_URL` defaults to `https://webrtc-new.fly.dev`
- `AI_USER_ID` defaults to `doctor-2`
- `WEBRTC_TEST_LOGIN_KEY` only if the realtime server requires `x-test-login-key`

## Control API

### Health

`GET /health`

### Join a consultation

`POST /join`

```json
{ "consultationId": "..." }
```

### Inspect state

`GET /status`

### Leave

`POST /leave`

```json
{ "agentId": "..." }
```

## Fly deployment

The root repository workflow `.github/workflows/deploy-ai-participant-fly.yml` builds and deploys this Dockerfile. Store `FLY_API_TOKEN` and `OPENAI_API_KEY` as GitHub Actions secrets. If the WebRTC server uses a test-login key, also store `WEBRTC_TEST_LOGIN_KEY`.
