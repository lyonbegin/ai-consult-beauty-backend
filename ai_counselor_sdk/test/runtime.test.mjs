import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {startRuntimeServer} from '../src/runtime/server.mjs';

test('runtime serves health and all five domain presets',async()=>{
 const server=startRuntimeServer(0);
 await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const health=await fetch(base+'/health');
  assert.equal(health.status,200);
  const h=await health.json();
  assert.equal(h.service,'ai-counselor-sdk');
  assert.equal(h.sdkVersion,'1.1.0');
  assert.equal(h.activeProfile,'generic');
  const presets=await fetch(base+'/v1/presets');
  assert.equal(presets.status,200);
  const names=Object.keys(await presets.json());
  assert.deepEqual(names,['generic','beauty','elderly-care','tutoring','interview']);
  const unauth=await fetch(base+'/v1/respond',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:'test',text:'hello'})});
  assert.equal(unauth.status,401);
 }finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
