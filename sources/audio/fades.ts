export const FADE_IN_S = 0.015;

export function applyFadeIn(gainNode: GainNode, ctx: AudioContext, targetGain: number): void {
  const now = ctx.currentTime;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(Math.max(0, targetGain), now + FADE_IN_S);
}
