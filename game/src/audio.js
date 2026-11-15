// audio.js — RUSTLINE procedural WebAudio. Original code for threejs-fps-02.
// No assets, no imports: every sound is synthesized. All methods are
// no-ops until init() runs on a user gesture. Noise comes from a small
// deterministic LFSR so no randomness call is used anywhere.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let s = 22222;
    for (let i = 0; i < len; i++) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      d[i] = ((s >>> 0) / 4294967295) * 2 - 1;
    }
  }

  // Short oscillator blip, optional pitch slide down/up to `slideTo`.
  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ctx) return;
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Looped-noise burst through a lowpass, optionally sweeping down to endFreq.
  function noise(dur, freq, vol, when, endFreq) {
    if (!ctx) return;
    const t = ctx.currentTime + (when || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(Math.max(10, endFreq), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  const SHOT = { vk7: [0.14, 1800], kestrel: [0.09, 2600], p9: [0.11, 2200] };

  return {
    init,
    shot(name) {
      const s = SHOT[name] || SHOT.p9;
      noise(s[0], s[1], 0.5);
      tone(120, 0.08, 'sine', 0.4, 0, 60); // low thump under the crack
    },
    reload() {
      noise(0.03, 3000, 0.25, 0);
      noise(0.03, 2200, 0.25, 0.15);
    },
    dry() {
      noise(0.04, 800, 0.3);
    },
    hit() {
      tone(1200, 0.07, 'sine', 0.25);
    },
    kill() {
      tone(1200, 0.07, 'sine', 0.25, 0);
      tone(1600, 0.09, 'sine', 0.25, 0.08);
    },
    step() {
      noise(0.03, 400, 0.06); // quiet footstep tick
    },
    plant() {
      tone(660, 0.09, 'sine', 0.25, 0);
      tone(880, 0.09, 'sine', 0.25, 0.12);
      tone(1100, 0.12, 'sine', 0.25, 0.24);
    },
    beep() {
      tone(880, 0.15, 'sine', 0.3);
    },
    explosion() {
      noise(1.2, 3000, 0.8, 0, 80);
      tone(55, 1.0, 'sine', 0.6, 0, 30);
    },
    roundWin() {
      tone(523, 0.12, 'sine', 0.3, 0);
      tone(659, 0.12, 'sine', 0.3, 0.12);
      tone(784, 0.24, 'sine', 0.3, 0.24);
    },
    roundLose() {
      tone(784, 0.12, 'sine', 0.3, 0);
      tone(659, 0.12, 'sine', 0.3, 0.12);
      tone(523, 0.24, 'sine', 0.3, 0.24);
    },
    click() {
      tone(2000, 0.03, 'sine', 0.15);
    },
    hurt() {
      tone(90, 0.18, 'sine', 0.5, 0, 50);
      noise(0.1, 300, 0.2);
    },
  };
}
