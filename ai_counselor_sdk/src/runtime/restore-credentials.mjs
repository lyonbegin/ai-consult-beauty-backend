import {constants,privateDecrypt} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {AI_PLATFORM_ROLE,AI_USER_ID,AI_USER_NAME,WEBRTC_BASE_URL} from './config.mjs';

const openaiPath=()=>process.env.OPENAI_API_KEY_FILE||'/data/openai_api_key';
const webrtcPath=()=>process.env.TEST_LOGIN_KEY_FILE||'/data/test_login_key';
const save=(file,data)=>{
 mkdirSync(dirname(file),{recursive:true});
 writeFileSync(file,data,{encoding:'utf8',mode:0o600});
};
function decryptLegacy(cipher){
 const b64=process.env.BOOTSTRAP_PRIVATE_KEY_B64||'';
 if(!cipher||!b64)return '';
 const key=Buffer.from(b64,'base64').toString('utf8');
 return privateDecrypt({
  key,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha1'
 },Buffer.from(cipher,'base64')).toString('utf8').trim();
}
async function restoreOpenAI(){
 if(process.env.OPENAI_API_KEY||existsSync(openaiPath()))return;
 if(!process.env.LEGACY_OPENAI_CIPHERTEXT_B64)return;
 const key=decryptLegacy(process.env.LEGACY_OPENAI_CIPHERTEXT_B64);
 if(!key.startsWith('sk-'))throw new Error('decrypted OpenAI key format invalid');
 const result=await fetch('https://api.openai.com/v1/models',{
  headers:{authorization:'Bearer '+key},signal:AbortSignal.timeout(12000)
 });
 if(!result.ok)throw new Error('OpenAI credential validation HTTP '+result.status);
 save(openaiPath(),key);
 console.log('[credential-restore] OpenAI key validated and saved in volume');
}
async function persistWebRTC(){
 const key=process.env.TEST_LOGIN_KEY||process.env.WEBRTC_TEST_LOGIN_KEY||'';
 if(!key||existsSync(webrtcPath()))return;
 const response=await fetch(WEBRTC_BASE_URL+'/auth/dev-token',{
   method:'POST',headers:{'content-type':'application/json','x-test-login-key':key},
   body:JSON.stringify({userId:AI_USER_ID,name:AI_USER_NAME,platformRole:AI_PLATFORM_ROLE}),
   signal:AbortSignal.timeout(12000)
 });
 if(!response.ok)throw new Error('WebRTC key validation HTTP '+response.status);
 save(webrtcPath(),key);
 console.log('[credential-restore] WebRTC key validated and saved in volume');
}
export async function restoreCredentialFiles(){
 try{await restoreOpenAI();}catch(e){console.error('[credential-restore] OpenAI:',e?.message||String(e));}
 try{await persistWebRTC();}catch(e){console.error('[credential-restore] WebRTC:',e?.message||String(e));}
}
