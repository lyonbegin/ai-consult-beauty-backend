import http from 'node:http';
import {readFile,access} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CounselorSession} from '../core/session.mjs';
import {COUNSELOR_PRESETS,normalizeCounselorProfile,counselorProfileFingerprint} from '../core/profile.mjs';
import {PARTICIPANT_ENABLED,COUNSELOR_PROFILE} from './config.mjs';
import {getSdkBootstrapPublicKey} from './restore-credentials.mjs';
import {getParticipantStatus} from './participant.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'../..');
const sessions=new Map();
const age=30*60*1000;
function tokenGood(req) {
  const required=process.env.RUNTIME_API_TOKEN||'';
  return required && req.headers.authorization==='Bearer '+required;
}
function configured(envName,fileName,defaultFile){
  return Boolean(process.env[envName])||existsSync(process.env[fileName]||defaultFile);
}
function send(res,status,data,contentType='application/json; charset=utf-8'){
  res.writeHead(status,{'content-type':contentType,'cache-control':'no-store','access-control-allow-origin':process.env.CORS_ORIGIN||'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type'});
  res.end(contentType.startsWith('application/json')?JSON.stringify(data):data);
}
async function json(req){
  let chunks=[],size=0;
  for await(const chunk of req){size+=chunk.length;if(size>16384)throw new Error('request too large');chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
}
async function staticFile(res,path,contentType){
  try{send(res,200,await readFile(join(root,path)),contentType);}
  catch{send(res,404,{error:'not found'});}
}
function getSession(id,input){
  const profile=normalizeCounselorProfile(input);
  const fingerprint=counselorProfileFingerprint(profile);
  const old=sessions.get(id);
  if(old&&old.fingerprint===fingerprint){old.at=Date.now();return old.session;}
  const session=new CounselorSession(profile);
  sessions.set(id,{session,fingerprint,at:Date.now()});
  return session;
}
export function startRuntimeServer(port=8080){
  const server=http.createServer(async(req,res)=>{
    try{
      if(req.method==='OPTIONS')return send(res,204,'');
      const path=new URL(req.url||'/','http://localhost').pathname;
      if(req.method==='GET'&&path==='/health')return send(res,200,{
        ok:true,service:'ai-counselor-sdk',sdkVersion:'1.1.0',
        activeProfile:COUNSELOR_PROFILE.preset,participantEnabled:PARTICIPANT_ENABLED,
        openaiConfigured:configured('OPENAI_API_KEY','OPENAI_API_KEY_FILE','/data/openai_api_key'),
        webrtcKeyConfigured:configured('TEST_LOGIN_KEY','TEST_LOGIN_KEY_FILE','/data/test_login_key')||Boolean(process.env.WEBRTC_TEST_LOGIN_KEY),
        apiAuthConfigured:Boolean(process.env.RUNTIME_API_TOKEN)
      });
      if(req.method==='GET'&&path==='/internal/bootstrap/public-key')return send(res,200,{algorithm:'RSA-OAEP-SHA256',publicKey:getSdkBootstrapPublicKey()});
      if(req.method==='GET'&&path==='/v1/presets')return send(res,200,COUNSELOR_PRESETS);
      if(req.method==='GET'&&path==='/v1/rooms/status')return send(res,200,{participantEnabled:PARTICIPANT_ENABLED,rooms:getParticipantStatus()});
      if(req.method==='GET'&&(path==='/'||path==='/playground'))return staticFile(res,'public/index.html','text/html; charset=utf-8');
      if(req.method==='GET'&&path==='/styles.css')return staticFile(res,'public/styles.css','text/css; charset=utf-8');
      if(req.method==='GET'&&path==='/sdk/ai-counselor.esm.js')return staticFile(res,'dist/sdk/ai-counselor.esm.js','text/javascript; charset=utf-8');
      if(req.method==='POST'&&(path==='/v1/respond'||path==='/v1/session/reset')){
        if(!tokenGood(req))return send(res,401,{error:'Runtime access token required'});
        const body=await json(req);
        const id=String(body.sessionId||'').trim();
        if(!id||id.length>128)return send(res,400,{error:'valid sessionId required'});
        if(path==='/v1/session/reset'){sessions.delete(id);return send(res,200,{ok:true});}
        const text=String(body.text||'').trim();
        if(!text||text.length>4000)return send(res,400,{error:'text must be 1..4000 chars'});
        if(sessions.size>1200)return send(res,429,{error:'session capacity exceeded'});
        const session=getSession(id,body.profile||{});
        const result=await session.respond(text,body.context||{});
        return send(res,200,{...result,sessionId:id,trace:{domain:result.profile.domain,role:result.profile.role,tools:result.profile.tools,model:session.chatModel}});
      }
      return send(res,404,{error:'not found'});
    }catch(error){console.error('[runtime-http]',error?.message||String(error));return send(res,500,{error:'runtime operation failed'});}
  });
  const timer=setInterval(()=>{for(const [id,v] of sessions)if(Date.now()-v.at>age)sessions.delete(id);},60000);
  timer.unref();
  server.listen(port,'0.0.0.0',()=>console.log('[runtime-http] listening on :'+port));
  return server;
}
