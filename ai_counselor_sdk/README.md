# AI Counselor SDK 1.1.0 — VideoCore composable implementation

The same counselor SDK is reused across domains (general / beauty / elderly care / tutoring / interviews).
Project configuration is injected via domain, name, role, objective, instructions, policy, tools, knowledge.

## IMPORTANT: VideoCore is imported, not copied

VideoCore is developed and deployed independently:
- Source: https://github.com/lyonbegin/video-town-front/tree/main/src/sdk
- ESM: https://video-town-front-production.up.railway.app/sdk/video-core.esm.js

This package calls the actual deployed VideoCore from inside the AI SDK via a dynamic ESM import.
AICounselor.loadVideoCore() loads and creates VideoCore.
AICounselor.openCamera() obtains the genuine MediaStream from VideoCore.openCamera().
AICounselor.setCameraMode('mask') / ('original') delegates to VideoCore.
AICounselor.replaceCallTracks() delegates to VideoCore cameraSession.replaceVideoTrack/replaceAudioTrack.
AICounselor.stopCamera() disposes the VideoCore camera session.

## Real RTC room architecture

VideoCore owns camera/microphone/face tracking/mask/transforms. It does NOT create consultation sessions or join mediasoup rooms.
Those actions are handled by the existing WebRTC room system through a project-provided roomAdapter.
AICounselor.enterRoom({roomAdapter,roomId}) opens the VideoCore camera and passes the real stream and counselor profile to roomAdapter.join({stream,profile,sessionId,roomId}). It does not simulate a room. leaveRoom() disconnects via the adapter.
The server-side bot participant is managed by src/runtime/participant.mjs and is controlled by PARTICIPANT_ENABLED.

## Example
~~~js
import { AICounselor } from 'https://ai-counselor-sdk-production.up.railway.app/sdk/ai-counselor.esm.js';
const counselor=AICounselor.create({
 endpoint:'https://ai-counselor-sdk-production.up.railway.app',
 profile:{preset:'elderly-care',name:'돌봄 상담사',role:'장기요양 안내'},
 roomAdapter: existingWebRtcRoomAdapter
});
const room=await counselor.enterRoom({roomId:'my-real-rtc-room'});
await counselor.setCameraMode('mask');
await counselor.replaceCallTracks({videoSender:room.videoSender,audioSender:room.audioSender});
await counselor.leaveRoom();
~~~

The host HTML must provide the VideoCore SDK import map for MindAR and Three.js dependencies, as in the deployed Playground.

## Deploy and verification
Existing Railway project thriving-education, existing single service ai-counselor-sdk, root /ai_counselor_sdk.
Playground: https://ai-counselor-sdk-production.up.railway.app/playground
The Playground now uses the VIDEO CALL layout: counselor tile, actual camera preview (picture-in-picture), microphone, camera, face-mask toggle, domain configuration and diagnostics.
It must not claim a joined room just because the local camera works. The UI shows the live PARTICIPANT_ENABLED status.
Text response testing is a collapsed developer-only section, not the main product.

Security: secrets OPENAI_API_KEY, TEST_LOGIN_KEY and RUNTIME_API_TOKEN stay on the Railway server. No public access to the runtime bearer token. Real AI conversation needs available OpenAI API account credits.
