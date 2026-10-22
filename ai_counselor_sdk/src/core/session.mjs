import { readFileSync } from 'node:fs';
import {
  buildCounselorInstructions,
  normalizeCounselorProfile,
} from './profile.mjs';

function extractResponseText(body) {
  if (typeof body?.output_text === 'string' && body.output_text.trim()) {
    return body.output_text.trim();
  }
  const parts = [];
  for (const item of body?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

function readConfiguredApiKey(initial = '') {
  const direct = String(initial || process.env.OPENAI_API_KEY || '').trim();
  if (direct) return direct;

  const file = String(process.env.OPENAI_API_KEY_FILE || '').trim();
  if (!file) return '';
  try {
    return readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
}

export class CounselorSession {
  constructor(profile, options = {}) {
    this.profile = normalizeCounselorProfile(profile);
    this.apiKey = readConfiguredApiKey(options.apiKey);
    this.chatModel = options.chatModel || process.env.OPENAI_CHAT_MODEL || 'gpt-5.6-sol';
    this.transcribeModel = options.transcribeModel || process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
    this.ttsModel = options.ttsModel || process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
    this.previousResponseId = null;
  }

  reset() {
    this.previousResponseId = null;
  }

  setProfile(profile) {
    this.profile = normalizeCounselorProfile(profile);
    this.reset();
  }

  requireApiKey() {
    if (!this.apiKey) this.apiKey = readConfiguredApiKey();
    if (!this.apiKey) throw new Error('OPENAI_API_KEY is not configured');
  }

  async respond(text, context = {}) {
    this.requireApiKey();
    const userText = String(text || '').trim();
    if (!userText) throw new Error('text is required');

    const contextText = Object.keys(context || {}).length
      ? `\n\n[application context]\n${JSON.stringify(context)}`
      : '';

    const payload = {
      model: this.chatModel,
      instructions: buildCounselorInstructions(this.profile),
      input: userText + contextText,
      max_output_tokens: 320,
    };
    if (this.previousResponseId) {
      payload.previous_response_id = this.previousResponseId;
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`OpenAI responses ${response.status}: ${JSON.stringify(body)}`);
    }

    this.previousResponseId = body.id || this.previousResponseId;
    const answer = extractResponseText(body) || '계속 말씀해 주세요.';
    return {
      text: answer,
      responseId: body.id || null,
      action: 'RESPOND',
      profile: this.profile,
    };
  }

  async transcribe(wavBuffer) {
    this.requireApiKey();
    const form = new FormData();
    form.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'utterance.wav');
    form.append('model', this.transcribeModel);
    if (this.profile.language) form.append('language', this.profile.language);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`OpenAI transcription ${response.status}: ${JSON.stringify(body)}`);
    }
    return String(body.text || '').trim();
  }

  async synthesize(text) {
    this.requireApiKey();
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.ttsModel,
        voice: this.profile.voice || 'coral',
        input: String(text || ''),
        response_format: 'pcm',
        instructions: `${this.profile.language === 'ko' ? '한국어로' : ''} ${this.profile.role}처럼 또렷하고 자연스럽게 말하세요.`,
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI speech ${response.status}: ${await response.text()}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
}
