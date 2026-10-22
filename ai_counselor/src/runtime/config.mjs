import { normalizeCounselorProfile } from '../core/profile.mjs';

function jsonEnv(name, fallback = {}) {
  try {
    return process.env[name] ? JSON.parse(process.env[name]) : fallback;
  } catch (error) {
    throw new Error(`${name} must contain valid JSON: ${error.message}`);
  }
}

const preset = process.env.COUNSELOR_PRESET || 'beauty';
export const COUNSELOR_PROFILE = normalizeCounselorProfile({
  preset,
  ...jsonEnv('COUNSELOR_PROFILE_JSON', {}),
});

export const PORT = Number(process.env.PORT || 3000);
export const WEBRTC_BASE_URL = String(process.env.WEBRTC_BASE_URL || 'https://webrtc-new.fly.dev').replace(/\/$/, '');
export const AI_USER_ID = process.env.AI_USER_ID || 'doctor-1';
export const AI_USER_NAME = process.env.AI_USER_NAME || COUNSELOR_PROFILE.name || 'AI 상담사';
export const AI_PLATFORM_ROLE = process.env.AI_PLATFORM_ROLE || 'doctor';
export const TEST_LOGIN_KEY = process.env.WEBRTC_TEST_LOGIN_KEY || process.env.TEST_LOGIN_KEY || '';
export const TEST_LOGIN_KEY_FILE = process.env.TEST_LOGIN_KEY_FILE || '';
export const TARGET_CONSULTATION_ID = process.env.CONSULTATION_ID || '';
export const POLL_MS = Number(process.env.CONSULTATION_POLL_MS || 3000);
export const PARTICIPANT_ENABLED = String(process.env.PARTICIPANT_ENABLED || 'true').toLowerCase() === 'true';

export const AUTO_ROOM_TITLE = process.env.AUTO_ROOM_TITLE || `${COUNSELOR_PROFILE.name} 상시 상담방`;
export const AUTO_PATIENT_ID = process.env.AUTO_PATIENT_ID || 'patient-1';
export const AUTO_PATIENT_NAME = process.env.AUTO_PATIENT_NAME || '테스트 환자';
export const AUTO_CREATE_ROOM = String(process.env.AUTO_CREATE_ROOM || 'true').toLowerCase() === 'true';
export const AUTO_START_ROOM = String(process.env.AUTO_START_ROOM || 'true').toLowerCase() === 'true';

export const VAD_RMS_THRESHOLD = Number(process.env.VAD_RMS_THRESHOLD || 0.018);
export const VAD_END_SILENCE_MS = Number(process.env.VAD_END_SILENCE_MS || 700);
export const VAD_MIN_SPEECH_MS = Number(process.env.VAD_MIN_SPEECH_MS || 250);
export const VAD_MAX_SPEECH_MS = Number(process.env.VAD_MAX_SPEECH_MS || 20000);
