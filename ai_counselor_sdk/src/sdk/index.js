import {COUNSELOR_PRESETS,normalizeCounselorProfile} from '../core/profile.mjs';
export const AI_COUNSELOR_SDK_VERSION='1.0.0';
export const counselorPresets=COUNSELOR_PRESETS;
const cleanEndpoint = value=>String(value||(typeof location!=='undefined'?location.origin:'')).replace(/\/$/,'');
const newSessionId = ()=>globalThis.crypto?.randomUUID?.()||('session-'+Date.now()+'-'+Math.random().toString(36).slice(2));
export class AICounselor {
  static create(options={}) {return new AICounselor(options);}
  constructor({endpoint,profile={preset:'generic'},sessionId,accessToken,fetchImpl}={}) {
    this.endpoint=cleanEndpoint(endpoint);
    this.profile=normalizeCounselorProfile(profile);
    this.sessionId=sessionId||newSessionId();
    this.accessToken=accessToken||'';
    this.fetchImpl=fetchImpl||globalThis.fetch?.bind(globalThis);
    if(!this.fetchImpl) throw new Error('fetch is required');
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
  async respond(text,context={}) {
    const message=String(text||'').trim();
    if(!message)throw new Error('text is required');
    return this.request('/v1/respond',{sessionId:this.sessionId,profile:this.profile,text:message,context});
  }
  async reset() {
    await this.request('/v1/session/reset',{sessionId:this.sessionId});
    this.sessionId=newSessionId();
    return this;
  }
}
export const createCounselor=options=>AICounselor.create(options);
