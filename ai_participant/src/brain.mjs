import {
  CHAT_MODEL,
  OPENAI_API_KEY,
  SYSTEM_PROMPT,
  TRANSCRIBE_MODEL,
  TTS_MODEL,
  TTS_VOICE,
} from './config.mjs';

export class Brain {
  constructor(sessionId, output) {
    this.sessionId = sessionId;
    this.output = output;
    this.previousResponseId = null;
    this.queue = Promise.resolve();
  }

  submit(userId, wav, durationMs) {
    this.queue = this.queue
      .then(() => this.runTurn(userId, wav, durationMs))
      .catch((error) => console.error(`[${this.sessionId}] turn failed`, error));
    return this.queue;
  }

  async transcribe(wav) {
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');
    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'utterance.wav');
    form.append('model', TRANSCRIBE_MODEL);
    form.append('language', 'ko');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`transcription ${response.status}: ${JSON.stringify(body)}`);
    return String(body.text || '').trim();
  }

  extractText(body) {
    if (typeof body.output_text === 'string' && body.output_text.trim()) return body.output_text.trim();
    const parts = [];
    for (const item of body.output || []) {
      for (const content of item.content || []) {
        if (typeof content.text === 'string') parts.push(content.text);
      }
    }
    return parts.join('\n').trim();
  }

  async reply(text) {
    const payload = {
      model: CHAT_MODEL,
      instructions: SYSTEM_PROMPT,
      input: text,
      max_output_tokens: 220,
    };
    if (this.previousResponseId) payload.previous_response_id = this.previousResponseId;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`responses ${response.status}: ${JSON.stringify(body)}`);
    this.previousResponseId = body.id || this.previousResponseId;
    return this.extractText(body) || '네, 들었습니다. 계속 말씀해 주세요.';
  }

  async speak(text) {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        voice: TTS_VOICE,
        input: text,
        response_format: 'pcm',
        instructions: '한국어 여성 상담자처럼 또렷하고 자연스럽게, 과장 없이 차분하게 말하세요.',
      }),
    });
    if (!response.ok) throw new Error(`speech ${response.status}: ${await response.text()}`);
    this.output.enqueuePcm24k(Buffer.from(await response.arrayBuffer()));
  }

  async runTurn(userId, wav, durationMs) {
    const startedAt = Date.now();
    const transcript = await this.transcribe(wav);
    if (!transcript) return;
    console.log(`[${this.sessionId}] ${userId} (${durationMs}ms): ${transcript}`);

    const answer = await this.reply(transcript);
    console.log(`[${this.sessionId}] AI: ${answer}`);
    await this.speak(answer);
    console.log(`[${this.sessionId}] turn queued to WebRTC audio in ${Date.now() - startedAt}ms`);
  }
}
