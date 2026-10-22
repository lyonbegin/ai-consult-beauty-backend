import {constants,privateDecrypt,generateKeyPairSync} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {AI_PLATFORM_ROLE,AI_USER_ID,AI_USER_NAME,WEBRTC_BASE_URL} from './config.mjs';
const openaiPath=()=>process.env.OPENAI_API_KEY_FILE||'/data/openai_api_key';
const webrtcPath=()=>process.env.TEST_LOGIN_KEY_FILE||'/data/test_login_key';
const privatePath=()=>process.env.SDK_BOOTSTRAP_PRIVATE_FILE||'/data/sdk-bootstrap-private.pem';
const publicPath=()=>process.env.SDK_BOOTSTRAP_PUBLIC_FILE||'/data/sdk-bootstrap-public.pem';
function save(file,data,mode=0o600){
 mkdirSync(dirname(file),{recursive:true});
 writeFileSync(file,data,{encoding:'utf8',mode});
}
export function getSdkBootstrapPublicKey(){
 if(!existsSync(privatePath())||!existsSync(publicPath())){
  const pair=generateKeyPairSync('rsa',{
   modulusLength:2048,
   publicKeyEncoding:{type:'spki',format:'pem'},
   privateKeyEncoding:{type:'pkcs8',format:'pem'}
  });
  save(privatePath(),pair.privateKey,0o600);
  save(publicPath(),pair.publicKey,0o644);
 }
 return readFileSync(publicPath(),'utf8');
}
function decryptSdk(cipher){
 getSdkBootstrapPublicKey();
 return privateDecrypt({
  key:readFileSync(privatePath(),'utf8'),
  padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'
 },Buffer.from(cipher,'base64')).toString('utf8').trim();
}
async function restoreOpenAI(){
 if(process.env.OPENAI_API_KEY||existsSync(openaiPath()))return;
 const cipher=process.env.SDK_BOOTSTRAP_CIPHERTEXT_B64||'';
 if(!cipher)return;
 let key=decryptSdk(cipher);
 if(!key.startsWith('sk-'))throw new Error('OpenAI decrypted credential has invalid format');
 const result=await fetch('https://api.openai.com/v1/models',{
  headers:{authorization:'Bearer '+key},signal:AbortSignal.timeout(15000)
 });
 if(!result.ok)throw new Error('OpenAI credential validation HTTP '+result.status);
 save(openaiPath(),key);
 key='';
 console.log('[credential-restore] OpenAI key validated and saved in SDK volume');
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
 console.log('[credential-restore] WebRTC key validated and saved in SDK volume');
}
export async function restoreCredentialFiles(){
 getSdkBootstrapPublicKey();
 try{await restoreOpenAI();}catch(e){console.error('[credential-restore] OpenAI:',e?.message||String(e));}
 try{await persistWebRTC();}catch(e){console.error('[credential-restore] WebRTC:',e?.message||String(e));}
}
