// WebAudio 合成音效（无版权素材）：啵(按下)、滑动呼呼、落杯、纸箱合盖、Nice 提示音、错误蜂鸣。所有输出接 master，可送往录制流。
export const SFX_NAMES = { pop: ['sfxPop', '按下'], whoosh: ['sfxWhoosh', '滑动'], cup: ['sfxCup', '落杯'], box: ['sfxBox', '纸箱合盖'], chime: ['sfxChime', 'Nice提示'], error: ['sfxError', '错误'] };
export const SFX_DUR = { pop: 0.15, whoosh: 0.4, cup: 0.2, box: 0.35, chime: 0.9, error: 0.35 };
export class Sfx {
  constructor() { this.ctx = null; }
  ensure() {
    if (this.ctx) return this.ctx;
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    this.ctx = new C(); this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
    this.recDest = this.ctx.createMediaStreamDestination(); this.master.connect(this.recDest);
    this.makeNoise(); return this.ctx;
  }
  makeNoise() { const len = Math.round(this.ctx.sampleRate * 0.6), b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = b.getChannelData(0); let s = 7; for (let i = 0; i < len; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; } this.noise = b; }
  now() { return this._t != null ? this._t : this.ctx.currentTime; }
  resume() { const c = this.ensure(); if (c && c.state === 'suspended') c.resume(); }
  play(name, S, o = {}) {
    const [k] = SFX_NAMES[name] || []; if (!k || S.sfxMute || !S[k]) return;
    if (this.hook && this._t == null) try { this.hook(name, o); } catch (e) { }
    if (!this.ensure()) return;
    const v = S.sfxVolume * (S[k + 'Vol'] ?? 1); if (v <= 0) return;
    this['_' + name](this.now(), v, o);
  }
  env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  osc(t, type, f0, f1, dur, vol, a = 0.004) { const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur); this.env(g, t, a, vol, dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + a + dur + 0.02); }
  nz(t, type, f0, f1, q, dur, vol, a = 0.005) { const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise; const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q; const g = c.createGain(); this.env(g, t, a, vol, dur); s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + a + dur + 0.02); }
  _pop(t, v) { this.osc(t, 'sine', 520, 180, 0.09, v * 0.55); this.nz(t, 'bandpass', 2400, 900, 2, 0.05, v * 0.25); }
  _whoosh(t, v, o) { const d = Math.min(0.6, Math.max(0.15, o.dur || 0.3)); this.nz(t, 'bandpass', 500, 1600, 1.2, d, v * 0.22, d * 0.4); }
  _cup(t, v) { this.osc(t, 'triangle', 900, 420, 0.07, v * 0.35); this.nz(t, 'highpass', 3000, 2000, 1, 0.04, v * 0.2); this.osc(t + 0.03, 'sine', 300, 160, 0.08, v * 0.3); }
  _box(t, v) { this.nz(t, 'lowpass', 1800, 400, 1, 0.12, v * 0.5); this.nz(t + 0.13, 'lowpass', 1400, 300, 1, 0.14, v * 0.55); this.osc(t + 0.13, 'sine', 140, 80, 0.12, v * 0.4); }
  _chime(t, v) { [784, 988, 1319].forEach((f, i) => { this.osc(t + i * 0.08, 'sine', f, f, 0.55, v * 0.22, 0.006); this.osc(t + i * 0.08, 'sine', f * 2, f * 2, 0.25, v * 0.06, 0.006); }); }
  _error(t, v) { this.osc(t, 'square', 150, 140, 0.12, v * 0.16); this.osc(t + 0.14, 'square', 150, 120, 0.16, v * 0.16); this.osc(t, 'sawtooth', 75, 70, 0.3, v * 0.1); }
}
// ---------- 离线渲染（AE / 3D 导出用）events: [{t, name, dur}] ----------
export async function renderSfxOffline(events, dur, S) {
  const C = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!C) return null;
  const sr = 44100, oc = new C(1, Math.max(1, Math.ceil(sr * dur)), sr);
  const x = new Sfx(); x.ctx = oc; x.master = oc.createGain(); x.master.connect(oc.destination); x.makeNoise();
  const S2 = { ...S, sfxMute: false }; for (const k in SFX_NAMES) S2[SFX_NAMES[k][0]] = true;
  for (const e of events) { x._t = e.t; x.play(e.name, S2, { dur: e.dur }); }
  return await oc.startRendering();
}
export function encodeWav(buf) {
  const ch = buf.getChannelData(0), n = ch.length, dv = new DataView(new ArrayBuffer(44 + n * 2));
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, buf.sampleRate, true); dv.setUint32(28, buf.sampleRate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, ch[i])); dv.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true); }
  return new Uint8Array(dv.buffer);
}
