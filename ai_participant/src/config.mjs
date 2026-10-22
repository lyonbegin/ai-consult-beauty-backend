export const API_BASE_URL = String(process.env.WEBRTC_BASE_URL || 'https://webrtc-new.fly.dev').replace(/\/$/, '');
export const AI_USER_ID = process.env.AI_USER_ID || 'doctor-1';
export const AI_USER_NAME = process.env.AI_USER_NAME || 'AI언니 의사';
export const AI_PLATFORM_ROLE = process.env.AI_PLATFORM_ROLE || 'doctor';
export const TEST_LOGIN_KEY = process.env.WEBRTC_TEST_LOGIN_KEY || '';
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-transcribe';
export const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-6-luna';
export const TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
export const TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'coral';
export const TARGET_CONSULTATION_ID = process.env.CONSULTATION_ID || '';
export const POLL_MS = Number(process.env.CONSULTATION_POLL_MS || 3000);
export const MAX_ACTIVE_ROOMS = Number(process.env.MAX_ACTIVE_ROOMS || 1);
export const VAD_RMS_THRESHOLD = Number(process.env.VAD_RMS_THRESHOLD || 0.018);
export const VAD_END_SILENCE_MS = Number(process.env.VAD_END_SILENCE_MS || 700);
export const VAD_MIN_SPEECH_MS = Number(process.env.VAD_MIN_SPEECH_MS || 250);
export const VAD_MAX_SPEECH_MS = Number(process.env.VAD_MAX_SPEECH_MS || 20000);
export const SYSTEM_PROMPT = process.env.AI_SYSTEM_PROMPT || [
  '당신은 영상통화방의 한 명의 참가자인 AI언니입니다.',
  '사용자에게 한국어 존댓말로 자연스럽고 짧게 답하세요.',
  '현재 단계는 음성 왕복 기능 검증이 목적이므로 한 번에 1~3문장으로 답하세요.',
  '상대가 테스트 문장을 말하면 자연스럽게 대화를 이어가세요.'
].join(' ');

export const AUTO_ROOM_TITLE = process.env.AUTO_ROOM_TITLE || 'AI언니 상시 상담방';
export const AUTO_PATIENT_ID = process.env.AUTO_PATIENT_ID || 'patient-1';
export const AUTO_PATIENT_NAME = process.env.AUTO_PATIENT_NAME || '테스트 환자';
export const AUTO_CREATE_ROOM = String(process.env.AUTO_CREATE_ROOM || 'true').toLowerCase() === 'true';
export const AUTO_START_ROOM = String(process.env.AUTO_START_ROOM || 'true').toLowerCase() === 'true';
