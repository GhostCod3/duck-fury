/** Tiny synthesized effects: no downloads, music files, or autoplay. */
export class Sound {
  enabled = true;
  private context?: AudioContext;

  unlock(): void {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* Silent play remains available if audio is unsupported. */ }
  }

  play(kind: 'punch' | 'kick' | 'hit' | 'win' | 'lose'): void {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const context = this.context;
    const start = context.currentTime;
    const duration = kind === 'win' ? .4 : kind === 'lose' ? .45 : .13;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === 'win' ? 'triangle' : 'sawtooth';
    oscillator.frequency.setValueAtTime({ punch: 145, kick: 95, hit: 76, win: 260, lose: 120 }[kind], start);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'win' ? 620 : 35, start + duration);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(.055, start + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
}
