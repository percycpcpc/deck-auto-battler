const STORAGE_KEY = 'dab_muted';
const MASTER_LEVEL = 0.16;
let context = null;
let master = null;
let muted = readMuted();

function readMuted() { try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; } }
export function isMuted() { return muted; }
export function setMuted(value) { muted = Boolean(value); try { localStorage.setItem(STORAGE_KEY, String(muted)); } catch { /* unavailable */ } if (context && master) master.gain.setTargetAtTime(muted ? 0 : MASTER_LEVEL, context.currentTime, 0.01); return muted; }
export function initAudio() { if (typeof window === 'undefined') return; const AudioContext = window.AudioContext || window.webkitAudioContext; if (!AudioContext) return; if (!context) { context = new AudioContext(); master = context.createGain(); master.gain.value = muted ? 0 : MASTER_LEVEL; master.connect(context.destination); } if (context.state === 'suspended') context.resume().catch(() => {}); }

function tone({ frequency, endFrequency = frequency, duration = 0.1, type = 'sine', gain = 0.12, delay = 0 }) {
  if (!context || !master || muted) return; const start = context.currentTime + delay, stop = start + duration, oscillator = context.createOscillator(), envelope = context.createGain();
  oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), stop);
  envelope.gain.setValueAtTime(0.0001, start); envelope.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.018, duration * 0.25)); envelope.gain.exponentialRampToValueAtTime(0.0001, stop);
  oscillator.connect(envelope).connect(master); oscillator.start(start); oscillator.stop(stop + 0.01);
}
function noise({ duration = 0.1, gain = 0.1, lowpass = 900, delay = 0 }) {
  if (!context || !master || muted) return; const start = context.currentTime + delay, frames = Math.ceil(context.sampleRate * duration), buffer = context.createBuffer(1, frames, context.sampleRate), data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const source = context.createBufferSource(), filter = context.createBiquadFilter(), envelope = context.createGain(); source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = lowpass;
  envelope.gain.setValueAtTime(gain, start); envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration); source.connect(filter).connect(envelope).connect(master); source.start(start); source.stop(start + duration);
}
export function playSfx(name) {
  if (!context || context.state !== 'running' || muted) return;
  if (name === 'reveal') return tone({ frequency: 760, endFrequency: 620, duration: 0.055, type: 'triangle', gain: 0.055 });
  if (name === 'charge') return tone({ frequency: 430, endFrequency: 360, duration: 0.06, type: 'triangle', gain: 0.045 });
  if (name === 'deploy') { noise({ duration: 0.11, gain: 0.075, lowpass: 420 }); return tone({ frequency: 105, endFrequency: 68, duration: 0.14, gain: 0.09 }); }
  if (name === 'impact') { noise({ duration: 0.085, gain: 0.1, lowpass: 1100 }); return tone({ frequency: 145, endFrequency: 82, duration: 0.105, type: 'triangle', gain: 0.07 }); }
  if (name === 'death') { tone({ frequency: 235, endFrequency: 72, duration: 0.26, type: 'sawtooth', gain: 0.055 }); return noise({ duration: 0.16, gain: 0.035, lowpass: 380, delay: 0.04 }); }
  if (name === 'heroDamage') { noise({ duration: 0.15, gain: 0.11, lowpass: 330 }); return tone({ frequency: 82, endFrequency: 42, duration: 0.2, gain: 0.12 }); }
  if (name === 'victory') { tone({ frequency: 220, duration: 0.12, type: 'triangle', gain: 0.055 }); tone({ frequency: 330, duration: 0.14, type: 'triangle', gain: 0.06, delay: 0.08 }); return tone({ frequency: 494, duration: 0.17, type: 'triangle', gain: 0.065, delay: 0.15 }); }
  if (name === 'defeat') { tone({ frequency: 196, endFrequency: 147, duration: 0.16, type: 'triangle', gain: 0.06 }); return tone({ frequency: 139, endFrequency: 70, duration: 0.25, type: 'sawtooth', gain: 0.05, delay: 0.1 }); }
  if (name === 'uiClick') return tone({ frequency: 510, endFrequency: 390, duration: 0.045, type: 'square', gain: 0.025 });
}
