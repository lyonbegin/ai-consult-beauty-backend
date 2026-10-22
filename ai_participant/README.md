# AI Unni WebRTC Participant

This directory contains a **client-only** AI participant for the existing `webrtc-new.fly.dev` service.

It does not create or replace any WebRTC server, SFU, signaling server, room server, or HTTP API. The Fly process opens no inbound application port. It behaves only like another participant connecting outbound to the existing service.

## Flow

```text
webrtc-new.fly.dev (existing server, unchanged)
        ↑                   ↓
  AI audio publish     remote audio consume
        ↑                   ↓
 RTCAudioSource       RTCAudioSink
        ↑                   ↓
      TTS PCM       VAD -> WAV -> STT
        ↑                   ↓
        └──── Responses API ────┘
```

The Node endpoint uses the same existing application protocol as the browser client:

- `POST /auth/dev-token`
- `GET /telemedicine/consultations/me`
- Socket.IO namespace `/realtime`
- `session:join`, `session:ready`
- `rtc:join`, `rtc:create-transport`, `rtc:connect-transport`
- `rtc:produce`, `rtc:consume`, `rtc:resume-consumer`, `rtc:list-producers`

No server-side event or endpoint is added.

## Browserless WebRTC

The client uses:

- `mediasoup-client`
- `mediasoup-client-wrtc`
- `@roamhq/wrtc`

`RTCAudioSink` provides raw PCM from the other participant. `RTCAudioSource` provides raw PCM for the AI participant's outgoing audio. Chromium/Playwright is not used.

## First test

1. Existing host creates a consultation in the current UI.
2. Add `doctor-2` in the **협진 의사 ID** field.
3. This client is already logged in as `doctor-2`, finds the consultation through `/telemedicine/consultations/me`, joins it, and marks itself ready.
4. Host presses **진료 시작**.
5. AI client runs `rtc:join` against the existing media server, consumes the user's audio, transcribes it, calls the normal Responses API, converts the reply to PCM, and publishes that PCM as its WebRTC microphone track.

For a fixed room during debugging, set `CONSULTATION_ID`.

## Required secret

- `OPENAI_API_KEY`

Optional if the existing dev-login endpoint requires it:

- `WEBRTC_TEST_LOGIN_KEY`

## Important

`gpt-4o-mini-tts` is used only as the initial non-Live TTS implementation and is configurable with `OPENAI_TTS_MODEL`. The media architecture is independent of OpenAI TTS and can later be replaced without touching the WebRTC server.
