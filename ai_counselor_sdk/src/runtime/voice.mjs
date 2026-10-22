import { CounselorSession } from '../core/session.mjs';
import { COUNSELOR_PROFILE } from './config.mjs';

export class VoiceCounselorBridge {
  constructor(sessionId, output) {
    this.sessionId = sessionId;
    this.output = output;
    this.counselor = new CounselorSession(COUNSELOR_PROFILE);
    this.queue = Promise.resolve();
  }

  submit(userId, wav, durationMs) {
    this.queue = this.queue
      .then(() => this.runTurn(userId, wav, durationMs))
      .catch((error) => console.error(`[${this.sessionId}] counselor turn failed`, error));
    return this.queue;
  }

  async runTurn(userId, wav, durationMs) {
    const startedAt = Date.now();
    const transcript = await this.counselor.transcribe(wav);
    if (!transcript) return;
    console.log(`[${this.sessionId}] ${userId} (${durationMs}ms): ${transcript}`);

    const result = await this.counselor.respond(transcript, { channel: 'webrtc', userId });
    console.log(`[${this.sessionId}] ${COUNSELOR_PROFILE.name}: ${result.text}`);

    const pcm = await this.counselor.synthesize(result.text);
    this.output.enqueuePcm24k(pcm);
    console.log(`[${this.sessionId}] counselor audio queued in ${Date.now() - startedAt}ms`);
  }
}
