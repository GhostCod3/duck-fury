/** Standard Gamepad API layout. No device-name guessing or vendor remapping. */
export class StandardGamepad {
  private index: number | null = null;
  private previous = new Set<number>();
  private blocked = new Set<number>();
  private neutral = false;
  reset(): void { this.blocked = new Set([0,1,2,9,12,13,14,15]); this.neutral = true; }
  read(pads: readonly (Gamepad | null)[]) {
    const pad = pads.find(p => p?.connected !== false && p?.mapping === 'standard' && p.index === this.index)
      ?? pads.find(p => p?.connected !== false && p?.mapping === 'standard');
    if (!pad) { this.index = null; this.previous.clear(); this.reset(); return { move:0,jump:false,pickup:false,fire:false,drop:false,pause:false,active:false,connected:false }; }
    if (this.index !== pad.index) { this.index = pad.index; this.previous.clear(); this.reset(); }
    const raw = new Set(pad.buttons.flatMap((b,i) => b.pressed || b.value > .5 ? [i] : []));
    for (const i of this.blocked) if (!raw.has(i)) this.blocked.delete(i);
    const held = (i:number) => raw.has(i) && !this.blocked.has(i);
    const edge = (i:number) => held(i) && !this.previous.has(i);
    const x = Number.isFinite(pad.axes[0]) ? Math.max(-1,Math.min(1,pad.axes[0])) : 0;
    const y = Number.isFinite(pad.axes[1]) ? pad.axes[1] : 0;
    if (Math.abs(x) <= .2 && Math.abs(y) <= .2) this.neutral = false;
    const stick = this.neutral || Math.abs(x) <= .2 ? 0 : Math.sign(x)*(Math.abs(x)-.2)/.8;
    const move = held(14) || held(15) ? Number(held(15))-Number(held(14)) : stick;
    const result = { move,jump:edge(0),pickup:edge(1),fire:held(2),drop:held(13)||!this.neutral&&y>.65,pause:edge(9),active:Math.abs(move)>0||[0,1,2,9,13].some(held),connected:true };
    this.previous = raw; return result;
  }
}
