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

  play(kind: 'punch' | 'kick' | 'hit' | 'win' | 'lose' | 'pistol' | 'shotgun' | 'rocket'): void {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const context = this.context;
    const start = context.currentTime;
    if (kind === 'pistol' || kind === 'shotgun' || kind === 'rocket') {
      const profiles = { pistol: {duration:.09, frequency:920, end:180, type:'square'}, shotgun:{duration:.24,frequency:150,end:38,type:'sawtooth'}, rocket:{duration:.42,frequency:65,end:190,type:'triangle'} } as const;
      const p = profiles[kind];
      const tone = context.createOscillator(), gain = context.createGain();
      tone.type = p.type; tone.frequency.setValueAtTime(p.frequency,start);
      tone.frequency.exponentialRampToValueAtTime(p.end,start+p.duration);
      gain.gain.setValueAtTime(.0001,start); gain.gain.exponentialRampToValueAtTime(.045,start+.004); gain.gain.exponentialRampToValueAtTime(.0001,start+p.duration);
      tone.connect(gain).connect(context.destination); tone.start(start); tone.stop(start+p.duration);
      tone.onended=()=>{tone.disconnect();gain.disconnect();};
      // Short high crack, broad scatter blast, or sustained low rocket exhaust.
      const length=Math.ceil(context.sampleRate*p.duration), buffer=context.createBuffer(1,length,context.sampleRate), samples=buffer.getChannelData(0);
      let seed=17; for(let i=0;i<length;i++){seed=(seed*1664525+1013904223)>>>0;samples[i]=(seed/2147483648-1);}
      const noise=context.createBufferSource(), filter=context.createBiquadFilter(), envelope=context.createGain();
      noise.buffer=buffer; filter.type=kind==='pistol'?'highpass':'lowpass'; filter.frequency.value=kind==='pistol'?2400:kind==='shotgun'?1700:420;
      envelope.gain.setValueAtTime(kind==='shotgun'?.12:.055,start); envelope.gain.exponentialRampToValueAtTime(.0001,start+p.duration);
      noise.connect(filter).connect(envelope).connect(context.destination);noise.start(start);noise.stop(start+p.duration);noise.onended=()=>{noise.disconnect();filter.disconnect();envelope.disconnect();};
      return;
    }
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
