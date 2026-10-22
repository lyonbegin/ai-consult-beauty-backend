import test from 'node:test';
import assert from 'node:assert/strict';
import {AICounselor,DEFAULT_VIDEO_CORE_SDK_URL} from '../src/sdk/index.js';

test('AI Counselor imports existing deployed VideoCore and delegates camera, mask and tracks',async()=>{
 let url,count=0,stopped=false,mode='original',replaced=0;
 const stream={getVideoTracks:()=>[],getAudioTracks:()=>[]};
 const camera={get mode(){return mode;},get stream(){return stream;},setMode:async m=>{mode=m;return stream;},getTrackingStatus:()=>({fps:12.5}),stop:()=>{stopped=true;},replaceVideoTrack:async()=>{replaced++;}};
 const c=AICounselor.create({endpoint:'https://runtime.example',videoCoreLoader:async input=>{url=input;count++;return {VIDEO_CORE_SDK_VERSION:'1.0.0',VideoCore:{create:async()=>({openCamera:async()=>camera})}};}});
 assert.match(DEFAULT_VIDEO_CORE_SDK_URL,/video-town-front.*\/sdk\/video-core\.esm\.js/);
 await c.openCamera();assert.equal(url,DEFAULT_VIDEO_CORE_SDK_URL);
 assert.equal(c.videoCoreVersion,'1.0.0');assert.equal(c.getCameraStream(),stream);
 await c.setCameraMode('mask');assert.equal(camera.mode,'mask');assert.equal(c.getTrackingStatus().fps,12.5);
 await c.replaceCallTracks({videoSender:{}});assert.equal(replaced,1);
 await c.openCamera();assert.equal(count,1);assert.equal(stopped,true);
 c.stopCamera();assert.equal(c.getCameraStream(),null);
});
test('WebRTC room adapter receives the actual VideoCore MediaStream and counselor profile',async()=>{
 let joined,stopped=false;const stream={kind:'test-media-stream'};
 const c=AICounselor.create({endpoint:'https://runtime.example',profile:{preset:'elderly-care'},videoCoreLoader:async()=>({VideoCore:{create:async()=>({openCamera:async()=>({stream,stop:()=>{stopped=true;}})})}}),roomAdapter:{join:async arg=>{joined=arg;return {leave:async()=>{}};}}});
 await c.enterRoom({roomId:'existing-room'});
 assert.equal(joined.stream,stream);assert.equal(joined.profile.domain,'elderly-care');assert.equal(joined.roomId,'existing-room');
 await c.leaveRoom();assert.equal(stopped,true);
});
test('real room joining cannot silently fall back to fake conferencing',async()=>{
 const c=AICounselor.create({endpoint:'https://runtime.example'});
 await assert.rejects(c.enterRoom(),/roomAdapter/);
});
