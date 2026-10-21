import type { CombatInput } from './combat';

/** Pointer IDs and capture keep movement independent of the two attack buttons. */
export class Controls {
  private readonly keys = new Set<string>();
  private movement = { x: 0, y: 0 };
  private punch = false;
  private kick = false;
  private padPointer: number | null = null;
  private actionPointers = new Map<number, HTMLElement>();
  private readonly pad = document.querySelector<HTMLElement>('#dpad')!;
  private readonly thumb = document.querySelector<HTMLElement>('#pad-thumb')!;

  constructor(private readonly onPause: () => void, private readonly onStart: () => void) {
    const gameKeys = ['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','j','k','z','x','escape','p','enter',' '];
    window.addEventListener('keydown', event => {
      if (document.querySelector('dialog[open]')) return;
      const key = event.key.toLowerCase();
      if (!gameKeys.includes(key)) return;
      event.preventDefault();
      if (event.repeat) return;
      this.keys.add(key);
      if (key === 'j' || key === 'z') this.punch = true;
      if (key === 'k' || key === 'x') this.kick = true;
      if (key === 'escape' || key === 'p') this.onPause();
      if (key === 'enter') this.onStart();
    });
    window.addEventListener('keyup', event => this.keys.delete(event.key.toLowerCase()));
    window.addEventListener('blur', () => this.clear());
    const updatePad = (event: PointerEvent) => {
      const rect = this.pad.getBoundingClientRect();
      let x = (event.clientX - rect.left - rect.width / 2) / (rect.width * .34);
      let y = (event.clientY - rect.top - rect.height / 2) / (rect.height * .34);
      const length = Math.hypot(x, y);
      if (length < .16) { x = 0; y = 0; }
      else if (length > 1) { x /= length; y /= length; }
      this.movement = { x, y };
      this.thumb.style.transform = `translate(${x * rect.width * .22}px,${y * rect.height * .22}px)`;
    };
    this.pad.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (this.padPointer !== null) return;
      this.padPointer = event.pointerId;
      this.pad.setPointerCapture(event.pointerId);
      this.pad.classList.add('active');
      updatePad(event);
    });
    this.pad.addEventListener('pointermove', event => {
      if (event.pointerId === this.padPointer) updatePad(event);
    });
    const releasePad = (event: PointerEvent) => {
      if (event.pointerId !== this.padPointer) return;
      this.padPointer = null;
      this.movement = { x: 0, y: 0 };
      this.pad.classList.remove('active');
      this.thumb.style.transform = '';
    };
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.pad.addEventListener(name, releasePad as EventListener);
    }
    for (const attack of ['punch', 'kick'] as const) {
      const button = document.querySelector<HTMLButtonElement>(`#${attack}-button`)!;
      button.addEventListener('pointerdown', event => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        this.actionPointers.set(event.pointerId, button);
        button.classList.add('active');
        this[attack] = true;
      });
      const release = (event: PointerEvent) => {
        this.actionPointers.delete(event.pointerId);
        if (![...this.actionPointers.values()].includes(button)) button.classList.remove('active');
      };
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        button.addEventListener(name, release as EventListener);
      }
      // Keyboard and assistive activation of the on-screen buttons.
      button.addEventListener('click', event => { if (event.detail === 0) this[attack] = true; });
    }
  }

  read(): CombatInput {
    const held = (...keys: string[]) => keys.some(key => this.keys.has(key)) ? 1 : 0;
    const input = {
      x: this.movement.x + held('d', 'arrowright') - held('a', 'arrowleft'),
      y: this.movement.y + held('s', 'arrowdown') - held('w', 'arrowup'),
      punch: this.punch,
      kick: this.kick,
    };
    this.punch = false;
    this.kick = false;
    return input;
  }

  clear(): void {
    this.keys.clear();
    this.movement = { x: 0, y: 0 };
    this.punch = this.kick = false;
    this.padPointer = null;
    this.actionPointers.clear();
    document.querySelectorAll('.active').forEach(element => element.classList.remove('active'));
    this.thumb.style.transform = '';
  }
}
