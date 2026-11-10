// Procedural music + sound effects. No audio files needed.
// Browsers block audio until a user gesture, so call audio.unlock() from a click.

let ctx = null;
let master = null;
let musicGain = null;
let noiseBuf = null;
let timer = null;
let step = 0;
let nextTime = 0;
let muted = localStorage.getItem("subwayMuted") === "1";

const BPM = 126;
const STEP = 60 / BPM / 4; // one 16th note
const ROOTS = [55, 65.41, 49, 73.42]; // A, C, G, D (one per bar)
const ARP = [1, 1.5, 2, 3, 2, 1.5, 2, 3];

function tone(freq, t, dur, type, vol, dest = musicGain) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(t, dur, vol, filterType, freq, dest = musicGain) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t);
  s.stop(t + dur + 0.05);
}

function kick(t) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(g).connect(musicGain);
  o.start(t);
  o.stop(t + 0.2);
}

function scheduleStep(i, t) {
  const bar = Math.floor(i / 16) % 4;
  const s = i % 16;
  const root = ROOTS[bar];

  if (s % 4 === 0) kick(t);
  if (s % 2 === 1) noise(t, 0.04, 0.18, "highpass", 7000);
  if (s === 4 || s === 12) noise(t, 0.12, 0.3, "bandpass", 1800);
  if (s % 4 !== 2) tone(root * 2, t, STEP * 1.6, "sawtooth", 0.16); // bass
  if (s % 2 === 0) tone(root * 4 * ARP[(s / 2) % 8], t, STEP * 1.8, "square", 0.05); // lead
  if (s === 0) tone(root * 8, t, STEP * 14, "triangle", 0.04); // pad
}

function tick() {
  while (nextTime < ctx.currentTime + 0.15) {
    scheduleStep(step, nextTime);
    nextTime += STEP;
    step += 1;
  }
}

const sfxGain = () => master;

export const audio = {
  unlock() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.28;
      musicGain.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
  },

  startMusic() {
    if (!ctx || timer) return;
    step = 0;
    nextTime = ctx.currentTime + 0.1;
    timer = setInterval(tick, 40);
  },

  stopMusic() {
    clearInterval(timer);
    timer = null;
  },

  // Lower the music during pause / game over.
  duck(on) {
    if (!ctx) return;
    musicGain.gain.setTargetAtTime(on ? 0.08 : 0.28, ctx.currentTime, 0.15);
  },

  isMuted: () => muted,

  setMuted(value) {
    muted = value;
    localStorage.setItem("subwayMuted", value ? "1" : "0");
    if (ctx) master.gain.setTargetAtTime(value ? 0 : 0.8, ctx.currentTime, 0.05);
  },

  coin() {
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(988, t, 0.08, "square", 0.12, sfxGain());
    tone(1319, t + 0.07, 0.18, "square", 0.12, sfxGain());
  },

  jump() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(280, t);
    o.frequency.exponentialRampToValueAtTime(760, t + 0.18);
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(sfxGain());
    o.start(t);
    o.stop(t + 0.3);
  },

  slide() {
    if (!ctx) return;
    noise(ctx.currentTime, 0.3, 0.35, "bandpass", 900, sfxGain());
  },

  swish() {
    if (!ctx) return;
    noise(ctx.currentTime, 0.12, 0.2, "highpass", 2500, sfxGain());
  },

  crash() {
    if (!ctx) return;
    const t = ctx.currentTime;
    noise(t, 0.5, 0.8, "lowpass", 900, sfxGain());
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.5);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g).connect(sfxGain());
    o.start(t);
    o.stop(t + 0.6);
  },

  beep(go = false) {
    if (!ctx) return;
    tone(go ? 880 : 440, ctx.currentTime, go ? 0.5 : 0.18, "square", 0.18, sfxGain());
  },
};
