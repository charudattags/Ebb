// Three sounds only, synthesised with Web Audio — no audio files. Every call
// site checks the store's soundOn flag before calling these, and nothing
// here plays automatically; a caller decides when a sound is earned.
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ctx) ctx = new AudioCtx();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, startAt: number, duration: number, gainPeak: number, type: OscillatorType = "sine") {
  const audio = getContext();
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = audio.currentTime + startAt;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(gainPeak, t0 + duration * 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

/** Soft low tone as the chart reveal completes. */
export function playChartReveal() {
  tone(196, 0, 0.9, 0.05, "sine");
}

/** Rising tone on plan approval. */
export function playApprove() {
  tone(392, 0, 0.18, 0.06, "sine");
  tone(523.25, 0.14, 0.28, 0.07, "sine");
}

/** Muted click on filters. */
export function playClick() {
  tone(720, 0, 0.05, 0.03, "square");
}
