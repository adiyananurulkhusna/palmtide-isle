// Synthesised sound only: every effect and the music loop are built from
// WebAudio oscillators and filtered noise, so the game ships no audio files
// and makes no network request. Starts on the first user gesture.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let waveGain = null;
  let musicTimer = 0;
  let musicStep = 0;
  let enabled = true;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Gentle looping surf: filtered noise, low volume.
      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * 0.5;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      waveGain = ctx.createGain();
      waveGain.gain.value = 0.05;
      noise.connect(filter);
      filter.connect(waveGain);
      waveGain.connect(master);
      noise.start();
      // Engine hum, silent until driving.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Police siren, silent until wanted is high.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  function blip(freq, duration, type, volume, slideTo) {
    if (!ctx || !enabled) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
      gain.gain.setValueAtTime(volume || 0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch { /* sound is best-effort */ }
  }

  // A slow steel-drum-ish island melody, one note per beat, over a I–vi–IV–V loop.
  const MELODY = [523, 659, 784, 659, 440, 523, 587, 659, 523, 659, 784, 880, 784, 659, 587, 523];
  const BASS = [131, 110, 104, 98];

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    setEnabled(value) {
      enabled = value;
      if (master) master.gain.value = value ? 0.5 : 0;
    },
    punch() { blip(160, 0.12, 'square', 0.16, 70); },
    coin() { blip(880, 0.18, 'sine', 0.14, 1320); },
    crash() { blip(90, 0.3, 'sawtooth', 0.2, 45); },
    mission() { blip(523, 0.12, 'sine', 0.14); setTimeout(() => blip(784, 0.2, 'sine', 0.14), 110); },
    wantedUp() { blip(700, 0.15, 'square', 0.12, 900); },
    engine(speed01) {
      if (!ctx) return;
      engineGain.gain.value = speed01 > 0.02 ? 0.045 + speed01 * 0.05 : 0;
      engineOsc.frequency.value = 50 + speed01 * 130;
    },
    siren(on, time) {
      if (!ctx) return;
      sirenGain.gain.value = on ? 0.035 : 0;
      if (on) sirenOsc.frequency.value = 650 + Math.sin(time * 4) * 180;
    },
    /** Call every frame with dt; plays the melody. */
    music(dt) {
      if (!ctx || !enabled) return;
      musicTimer -= dt;
      if (musicTimer > 0) return;
      musicTimer = 0.42;
      const note = MELODY[musicStep % MELODY.length];
      const bass = BASS[Math.floor(musicStep / 4) % BASS.length];
      blip(note, 0.36, 'triangle', 0.07);
      if (musicStep % 4 === 0) blip(bass, 0.5, 'sine', 0.09);
      musicStep += 1;
    },
  };
}
