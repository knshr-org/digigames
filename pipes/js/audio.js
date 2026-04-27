const AudioManager = (() => {
  const LS_KEY = 'pipes_settings';
  let ctx = null;
  let bgmElement = null;
  let bgmGain = null;
  let sfxGain = null;
  let fadeInterval = null;
  let settings = { bgmVolume: 0.7, sfxVolume: 0.8, bgmMuted: false, sfxMuted: false };

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY));
      if (saved) Object.assign(settings, saved);
    } catch {}
  }

  function saveSettings() {
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
  }

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    sfxGain = ctx.createGain();
    sfxGain.gain.value = settings.sfxMuted ? 0 : settings.sfxVolume;
    sfxGain.connect(ctx.destination);

    bgmElement = document.getElementById('bgmAudio');
    if (bgmElement) {
      const source = ctx.createMediaElementSource(bgmElement);
      bgmGain = ctx.createGain();
      bgmGain.gain.value = settings.bgmMuted ? 0 : settings.bgmVolume;
      source.connect(bgmGain);
      bgmGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function playBGM() {
    if (!bgmElement) return;
    init();
    if (bgmGain) bgmGain.gain.value = settings.bgmMuted ? 0 : settings.bgmVolume;
    bgmElement.play().catch(() => {});
  }

  function stopBGM() {
    if (bgmElement) bgmElement.pause();
  }

  function fadeBGM(targetVol, duration) {
    if (!bgmGain) return;
    clearInterval(fadeInterval);
    const startVol = bgmGain.gain.value;
    const steps = 20;
    const stepTime = duration / steps;
    let step = 0;
    fadeInterval = setInterval(() => {
      step++;
      const t = step / steps;
      bgmGain.gain.value = startVol + (targetVol - startVol) * t;
      if (step >= steps) {
        clearInterval(fadeInterval);
        bgmGain.gain.value = targetVol;
      }
    }, stepTime);
  }

  function setBGMVolume(v) {
    settings.bgmVolume = v;
    if (bgmGain && !settings.bgmMuted) bgmGain.gain.value = v;
    saveSettings();
  }

  function setSFXVolume(v) {
    settings.sfxVolume = v;
    if (sfxGain && !settings.sfxMuted) sfxGain.gain.value = v;
    saveSettings();
  }

  function toggleBGMMute() {
    settings.bgmMuted = !settings.bgmMuted;
    if (bgmGain) bgmGain.gain.value = settings.bgmMuted ? 0 : settings.bgmVolume;
    saveSettings();
    return settings.bgmMuted;
  }

  function toggleSFXMute() {
    settings.sfxMuted = !settings.sfxMuted;
    if (sfxGain) sfxGain.gain.value = settings.sfxMuted ? 0 : settings.sfxVolume;
    saveSettings();
    return settings.sfxMuted;
  }

  function osc(type, freq, duration, startTime) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.3, startTime);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    o.connect(g);
    g.connect(sfxGain);
    o.start(startTime);
    o.stop(startTime + duration);
  }

  const sfxMap = {
    click() {
      const t = ctx.currentTime;
      osc('square', 800, 0.05, t);
    },
    flap() {
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(400, t);
      o.frequency.linearRampToValueAtTime(700, t + 0.08);
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      o.connect(g); g.connect(sfxGain);
      o.start(t); o.stop(t + 0.08);
    },
    score() {
      const t = ctx.currentTime;
      osc('sine', 523, 0.1, t);
      osc('sine', 659, 0.1, t + 0.07);
    },
    powerup() {
      const t = ctx.currentTime;
      osc('sine', 523, 0.06, t);
      osc('sine', 659, 0.06, t + 0.05);
      osc('sine', 784, 0.06, t + 0.1);
      osc('sine', 1047, 0.08, t + 0.15);
    },
    hit() {
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g); g.connect(sfxGain);
      o.start(t); o.stop(t + 0.3);
    },
    milestone() {
      const t = ctx.currentTime;
      osc('sine', 523, 0.15, t);
      osc('sine', 659, 0.15, t + 0.12);
      osc('sine', 784, 0.2, t + 0.24);
    },
    submit() {
      const t = ctx.currentTime;
      osc('sine', 880, 0.1, t);
      osc('sine', 1320, 0.12, t + 0.08);
    },
  };

  function playSFX(name) {
    if (!ctx) return;
    if (settings.sfxMuted) return;
    const fn = sfxMap[name];
    if (fn) fn();
  }

  function getSettings() {
    return { ...settings };
  }

  loadSettings();

  return {
    init, playBGM, stopBGM, fadeBGM, playSFX,
    setBGMVolume, setSFXVolume, toggleBGMMute, toggleSFXMute,
    getSettings, loadSettings, saveSettings,
  };
})();
