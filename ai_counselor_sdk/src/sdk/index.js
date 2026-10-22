import {COUNSELOR_PRESETS,normalizeCounselorProfile} from '../core/profile.mjs';
export const AI_COUNSELOR_SDK_VERSION='1.1.0';
export const counselorPresets=COUNSELOR_PRESETS;
// Existing deployed VideoCore SDK is the single camera/mask engine.
export const DEFAULT_VIDEO_CORE_SDK_URL='https://video-town-front-production.up.railway.app/sdk/video-core.esm.js';
const cleanEndpoint=value=>String(value||(typeof location!=='undefined'?location.origin:'')).replace(/\/$/,'');
const newSessionId=()=>globalThis.crypto?.randomUUID?.()||('session-'+Date.now()+'-'+Math.random().toString(36).slice(2));
const defaultVideoCoreLoader=url=>import(/* @vite-ignore */ url);
export class AICounselor {
 static create(options={}){return new AICounselor(options);}
 constructor({endpoint,profile={preset:'generic'},sessionId,accessToken,fetchImpl,videoCoreUrl,videoCoreLoader,roomAdapter}={}){
  this.endpoint=cleanEndpoint(endpoint);
  this.profile=normalizeCounselorProfile(profile);
  this.sessionId=sessionId||newSessionId();
  this.accessToken=accessToken||'';
  this.fetchImpl=fetchImpl||globalThis.fetch?.bind(globalThis);
  this.videoCoreUrl=videoCoreUrl||DEFAULT_VIDEO_CORE_SDK_URL;
  this.videoCoreLoader=videoCoreLoader||defaultVideoCoreLoader;
  this.roomAdapter=roomAdapter||null;
  this.videoCorePromise=null;this.videoCore=null;this.videoCoreVersion=null;
  this.cameraSession=null;this.roomSession=null;
  if(!this.fetchImpl)throw new Error('fetch is required');
 }
 getProfile(){return structuredClone(this.profile);}
 configure(changes={}){this.profile=normalizeCounselorProfile({...this.profile,...changes});return this;}
 usePreset(preset,overrides={}){if(!COUNSELOR_PRESETS[preset])throw new Error('Unknown preset: '+preset);this.profile=normalizeCounselorProfile({preset,...overrides});return this;}
 async request(path,body){
  const headers={'content-type':'application/json'};
  if(this.accessToken)headers.authorization='Bearer '+this.accessToken;
  const response=await this.fetchImpl(this.endpoint+path,{method:'POST',headers,body:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload.error||('Runtime HTTP '+response.status));
  return payload;
 }
 async respond(text,context={}){
  const message=String(text||'').trim();
  if(!message)throw new Error('text is required');
  return this.request('/v1/respond',{sessionId:this.sessionId,profile:this.profile,text:message,context});
 }
 async reset(){
  await this.request('/v1/session/reset',{sessionId:this.sessionId});
  this.sessionId=newSessionId();return this;
 }
 async loadVideoCore(){
  if(!this.videoCorePromise){
   this.videoCorePromise=Promise.resolve().then(()=>this.videoCoreLoader(this.videoCoreUrl)).then(async sdk=>{
    if(typeof sdk?.VideoCore?.create!=='function')throw new Error('VideoCore SDK entrypoint missing: '+this.videoCoreUrl);
    this.videoCoreVersion=sdk.VIDEO_CORE_SDK_VERSION||null;
    this.videoCore=await sdk.VideoCore.create({diagnosticsBaseUrl:new URL(this.videoCoreUrl).origin});
    return this.videoCore;
   }).catch(error=>{this.videoCorePromise=null;throw error;});
  }
  return this.videoCorePromise;
 }
 async openCamera(options={}){
  const core=await this.loadVideoCore();this.stopCamera();
  this.cameraSession=await core.openCamera({mode:'original',...options});
  return this.cameraSession;
 }
 async setCameraMode(mode){if(!this.cameraSession)throw new Error('카메라를 먼저 연결하십시오.');return this.cameraSession.setMode(mode);}
 getCameraStream(){return this.cameraSession?.stream||null;}
 getTrackingStatus(){return this.cameraSession?.getTrackingStatus()||null;}
 stopCamera(){if(this.cameraSession)this.cameraSession.stop();this.cameraSession=null;}
 // Room creation, signaling, and SFU are supplied by the hosting project's existing WebRTC adapter.
 async enterRoom({roomAdapter=this.roomAdapter,cameraOptions={},...roomOptions}={}){
  if(!roomAdapter||typeof roomAdapter.join!=='function')throw new Error('진료실 입장에는 프로젝트의 WebRTC roomAdapter가 필요합니다.');
  if(this.roomSession)throw new Error('이미 입장한 상담실이 있습니다.');
  let opened=false;
  try{
   if(!this.cameraSession){await this.openCamera(cameraOptions);opened=true;}
   const room=await roomAdapter.join({stream:this.getCameraStream(),profile:this.getProfile(),sessionId:this.sessionId,...roomOptions});
   if(!room)throw new Error('roomAdapter.join did not return a room');
   this.roomSession=room;return room;
  }catch(error){if(opened)this.stopCamera();throw error;}
 }
 async leaveRoom(){
  const room=this.roomSession;this.roomSession=null;
  try{await room?.leave?.();}finally{this.stopCamera();}
 }
 async replaceCallTracks({videoSender,audioSender}={}){
  if(!this.cameraSession)throw new Error('카메라를 먼저 연결하십시오.');
  if(videoSender)await this.cameraSession.replaceVideoTrack(videoSender);
  if(audioSender)await this.cameraSession.replaceAudioTrack(audioSender);
 }
}
export const createCounselor=options=>AICounselor.create(options);
