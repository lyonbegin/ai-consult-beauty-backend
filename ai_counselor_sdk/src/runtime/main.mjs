import {PORT,PARTICIPANT_ENABLED,COUNSELOR_PROFILE} from './config.mjs';
import {startRuntimeServer} from './server.mjs';
import {runParticipant,stopParticipant} from './participant.mjs';
import {restoreCredentialFiles} from './restore-credentials.mjs';
await restoreCredentialFiles();
const server=startRuntimeServer(PORT);
console.log('[boot] AI Counselor SDK v1.1.0 / preset='+COUNSELOR_PROFILE.preset+' / domain='+COUNSELOR_PROFILE.domain);
let participantTask=null;
if(PARTICIPANT_ENABLED)participantTask=runParticipant().catch(e=>console.error('[participant] fatal',e.message));
else console.log('[participant] disabled until credentials and room are verified');
async function shutdown(signal){
  console.log('[shutdown] '+signal);
  await stopParticipant().catch(()=>undefined);
  await new Promise(resolve=>server.close(resolve));
  await participantTask?.catch(()=>undefined);
  process.exit(0);
}
process.on('SIGTERM',()=>void shutdown('SIGTERM'));
process.on('SIGINT',()=>void shutdown('SIGINT'));
