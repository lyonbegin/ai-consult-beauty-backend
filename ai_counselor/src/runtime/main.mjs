import { PARTICIPANT_ENABLED, PORT, COUNSELOR_PROFILE } from './config.mjs';
import { startRuntimeServer } from './server.mjs';
import { runParticipant, stopParticipant } from './participant.mjs';

const server = startRuntimeServer(PORT);
console.log(`[boot] AI Counselor SDK runtime domain=${COUNSELOR_PROFILE.domain} role=${COUNSELOR_PROFILE.role}`);

let participantTask = null;
if (PARTICIPANT_ENABLED) {
  participantTask = runParticipant().catch((error) => {
    console.error('[participant] fatal', error);
  });
} else {
  console.log('[participant] disabled');
}

async function shutdown(signal) {
  console.log(`[shutdown] ${signal}`);
  await stopParticipant().catch(() => undefined);
  await new Promise((resolve) => server.close(resolve));
  await participantTask?.catch(() => undefined);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
