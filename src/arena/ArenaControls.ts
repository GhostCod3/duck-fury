import type { ArenaInput } from './ArenaWorld';

/** Independent pointer ownership supports move + fire + jump on a landscape phone. */
export class ArenaControls {
  private keys = new Set<string>();
  private pointers = new Map<number, { element: HTMLElement; action: string }>();
  private edges = { jump: false, pickup: false };
  private move = 0;
  private drop = false;
  private padPointer: number | null = null;
  private previousPad = { jump: false, pickup: false, pause: false };
  private abort = new AbortController();
  private pad = document.getElementById('arena-pad')!;
  private thumb = document.getElementById('arena-thumb')!;
  constructor(private pause: () => void, private start: () => void) {
    const signal = this.abort.signal, gameKeys = ['a','d','s','w','arrowleft','arrowright','arrowup','arrowdown',' ','j','z','e','k','x','escape','p','enter'];
    window.addEventListener('keydown', e => {
      if (document.querySelector('dialog[open]')) return;
      const k = e.key.toLowerCase(); if (!gameKeys.includes(k)) return; e.preventDefault();
      this.keys.add(k); if (e.repeat) return;
      if ([' ','w','arrowup','k','x'].includes(k)) this.edges.jump = true;
      if (k === 'e') this.edges.pickup = true;
      if (k === 'escape' || k === 'p') this.pause();
      if (k === 'enter') this.start();
    }, { signal });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()), { signal });
    const updatePad = (e: PointerEvent) => {
      const r = this.pad.getBoundingClientRect(), x = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / (r.width * .32)));
      this.move = Math.abs(x) < .18 ? 0 : x;
      this.drop = e.clientY > r.top + r.height * .85;
      this.thumb.style.transform = `translateX(${this.move * 30}px)`;
    };
    this.pad.addEventListener('pointerdown', e => {
      e.preventDefault(); if (this.padPointer !== null) return;
      this.padPointer = e.pointerId; this.pad.setPointerCapture(e.pointerId); this.pad.classList.add('active'); updatePad(e);
    }, { signal });
    this.pad.addEventListener('pointermove', e => { if (e.pointerId === this.padPointer) updatePad(e); }, { signal });
    const releasePad = (e: PointerEvent) => {
      if (e.pointerId !== this.padPointer) return; this.padPointer = null; this.move = 0; this.drop = false;
      this.thumb.style.transform = ''; this.pad.classList.remove('active');
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.pad.addEventListener(type, releasePad as EventListener, { signal });
    document.querySelectorAll<HTMLElement>('[data-arena-action]').forEach(element => {
      const action = element.dataset.arenaAction!;
      element.addEventListener('pointerdown', e => {
        e.preventDefault(); element.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, { element, action }); element.classList.add('active');
        if (action === 'jump' || action === 'pickup') this.edges[action] = true;
      }, { signal });
      const release = (e: PointerEvent) => { this.pointers.delete(e.pointerId); if (![...this.pointers.values()].some(p => p.element === element)) element.classList.remove('active'); };
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) element.addEventListener(type, release as EventListener, { signal });
      element.addEventListener('click', e => { if (e.detail === 0 && (action === 'jump' || action === 'pickup')) this.edges[action] = true; }, { signal });
    });
  }
  read(): ArenaInput {
    const held = (...keys: string[]) => keys.some(k => this.keys.has(k));
    const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.mapping === 'standard');
    const jump = !!pad?.buttons[0]?.pressed, pickup = !!pad?.buttons[1]?.pressed, pause = !!pad?.buttons[9]?.pressed;
    if (pause && !this.previousPad.pause) this.pause();
    const axis = pad?.axes[0] ?? 0;
    const result: ArenaInput = {
      move: Math.max(-1, Math.min(1, this.move + Number(held('d','arrowright')) - Number(held('a','arrowleft')) + (Math.abs(axis) > .2 ? axis : 0))),
      jump: this.edges.jump || jump && !this.previousPad.jump,
      pickup: this.edges.pickup || pickup && !this.previousPad.pickup,
      fire: held('j','z') || [...this.pointers.values()].some(p => p.action === 'fire') || !!pad?.buttons[2]?.pressed,
      drop: this.drop || held('s','arrowdown') || (pad?.axes[1] ?? 0) > .65,
    };
    this.previousPad = { jump, pickup, pause }; this.edges = { jump: false, pickup: false }; return result;
  }
  clear(): void {
    this.keys.clear(); this.move = 0; this.drop = false; this.edges = { jump: false, pickup: false };
    const padId = this.padPointer; this.padPointer = null;
    if (padId !== null && this.pad.hasPointerCapture(padId)) this.pad.releasePointerCapture(padId);
    const pointers = [...this.pointers.entries()]; this.pointers.clear();
    for (const [id, { element }] of pointers) { element.classList.remove('active'); if (element.hasPointerCapture(id)) element.releasePointerCapture(id); }
    this.pad.classList.remove('active'); this.thumb.style.transform = '';
  }
  destroy(): void { this.clear(); this.abort.abort(); }
}
