import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCounselorProfile,COUNSELOR_PRESETS,buildCounselorInstructions} from '../src/core/profile.mjs';
import {AICounselor} from '../src/sdk/index.js';
test('five domain presets without hardcoded beauty default',()=>{
 assert.deepEqual(Object.keys(COUNSELOR_PRESETS),['generic','beauty','elderly-care','tutoring','interview']);
 assert.equal(normalizeCounselorProfile({}).preset,'generic');
});
test('each project injects custom profile',()=>{
 const p=normalizeCounselorProfile({preset:'elderly-care',name:'전국 요양 상담사',role:'복지 전문가',objective:'방문요양 안내',tools:['local-centers'],policy:{maxReplySentences:3}});
 assert.equal(p.domain,'elderly-care');assert.equal(p.name,'전국 요양 상담사');assert.deepEqual(p.tools,['local-centers']);
 assert.match(buildCounselorInstructions(p),/방문요양 안내/);
});
test('sdk sends project-specific profile to shared runtime',async()=>{
 let call;
 const client=AICounselor.create({endpoint:'https://runtime.example',accessToken:'test-key',profile:{preset:'tutoring'},fetchImpl:async(url,params)=>{
  call={url,params};return {ok:true,json:async()=>({text:'맞습니다'})};
 }});
 const result=await client.respond('문제 풀이를 도와주세요');
 assert.equal(result.text,'맞습니다');
 assert.equal(call.url,'https://runtime.example/v1/respond');
 assert.equal(JSON.parse(call.params.body).profile.domain,'education');
 assert.equal(call.params.headers.authorization,'Bearer test-key');
});
