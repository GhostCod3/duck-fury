import type { AttackKind } from '../game/combat';

export const CHARACTER_IDS = ['rook', 'dustjaw'] as const;
export type CharacterId = typeof CHARACTER_IDS[number];
export type CharacterState = 'idle' | 'walk' | 'punch1' | 'punch2' | 'punch3' | 'kick' | 'attack' | 'hurt' | 'death';

export const REQUIRED_STATES: Record<CharacterId, readonly CharacterState[]> = {
  rook: ['idle', 'walk', 'punch1', 'punch2', 'punch3', 'kick', 'hurt', 'death'],
  dustjaw: ['idle', 'walk', 'attack', 'hurt', 'death'],
};

export interface CharacterClip {
  frames: number[];
  frameRate: number;
}

export interface CharacterSheet {
  sheet: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  origin: { x: number; y: number };
  /** One constant, uniform display scale; never animated or stretched. */
  scale: number;
  animations: Partial<Record<CharacterState, CharacterClip>>;
}

export interface CharacterPose {
  facing: 1 | -1;
  moving: boolean;
  attack: AttackKind | null;
  progress: number;
  hurt: boolean;
  dead: boolean;
  /** Simulation time in milliseconds. Pausing or hit-stop leaves this unchanged. */
  time: number;
}

export interface CharacterManifestResult {
  characters: Partial<Record<CharacterId, CharacterSheet>>;
  warnings: string[];
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const integer = (value: unknown, min: number, max: number): value is number =>
  finite(value) && Number.isInteger(value) && value >= min && value <= max;

/** Bad or incomplete packs are rejected per character without preventing play. */
export function parseCharacterManifest(input: unknown): CharacterManifestResult {
  const result: CharacterManifestResult = { characters: {}, warnings: [] };
  if (!record(input) || input.version !== 1 || !record(input.characters)) {
    result.warnings.push('Expected character manifest version 1 with a characters object.');
    return result;
  }
  for (const id of CHARACTER_IDS) {
    const raw = input.characters[id];
    if (raw === undefined) continue;
    const reject = (reason: string) => result.warnings.push(`${id}: ${reason}; using procedural fallback.`);
    if (!record(raw)) { reject('invalid character definition'); continue; }
    // Local files only: reject URL schemes, absolute paths, traversal, and non-alpha formats.
    if (typeof raw.sheet !== 'string' ||
        !/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(png|webp)$/i.test(raw.sheet)) {
      reject('sheet must be a relative PNG or WebP path'); continue;
    }
    if (!integer(raw.frameWidth, 1, 1024) || !integer(raw.frameHeight, 1, 1024) ||
        !integer(raw.frameCount, 2, 256)) {
      reject('invalid frame dimensions or frame count'); continue;
    }
    if (!record(raw.origin) || !finite(raw.origin.x) || !finite(raw.origin.y) ||
        raw.origin.x < 0 || raw.origin.x > 1 || raw.origin.y < 0 || raw.origin.y > 1 ||
        !finite(raw.scale) || raw.scale <= 0 || raw.scale > 4) {
      reject('invalid ground origin or uniform scale'); continue;
    }
    if (!record(raw.animations)) { reject('missing animations'); continue; }
    const animations: CharacterSheet['animations'] = {};
    for (const state of REQUIRED_STATES[id]) {
      const clip = raw.animations[state];
      if (!record(clip) || !Array.isArray(clip.frames) || clip.frames.length < 2 ||
          clip.frames.length > 256 || new Set(clip.frames).size < 2 ||
          !clip.frames.every(frame => integer(frame, 0, (raw.frameCount as number) - 1)) ||
          !finite(clip.frameRate) || clip.frameRate <= 0 || clip.frameRate > 60) {
        reject(`invalid or missing ${state} animation (at least two distinct frames required)`);
        break;
      }
      animations[state] = { frames: [...clip.frames], frameRate: clip.frameRate };
    }
    if (REQUIRED_STATES[id].some(state => !animations[state])) continue;
    result.characters[id] = {
      sheet: raw.sheet, frameWidth: raw.frameWidth, frameHeight: raw.frameHeight,
      frameCount: raw.frameCount, origin: { x: raw.origin.x, y: raw.origin.y },
      scale: raw.scale, animations,
    };
  }
  return result;
}

export function stateForPose(pose: CharacterPose): CharacterState {
  if (pose.dead) return 'death';
  if (pose.hurt) return 'hurt';
  if (pose.attack) return pose.attack === 'enemy' ? 'attack' : pose.attack;
  return pose.moving ? 'walk' : 'idle';
}

/** Checks the decoded grid, including unused transparent padding cells in the last row. */
export function validSheetGrid(sheet: CharacterSheet, width: number, height: number): boolean {
  return integer(width, 1, 4096) && integer(height, 1, 4096) &&
    width % sheet.frameWidth === 0 && height % sheet.frameHeight === 0 &&
    (width / sheet.frameWidth) * (height / sheet.frameHeight) >= sheet.frameCount;
}

/** Selects actual sheet frames using the combat clock, not Phaser's independent animation clock. */
export class CharacterAnimation {
  private state: CharacterState | null = null;
  private startedAt = 0;
  private previousTime = -1;
  private previousProgress = 0;

  frame(sheet: CharacterSheet, pose: CharacterPose): number | undefined {
    const state = stateForPose(pose);
    const clip = sheet.animations[state];
    const restartedAttack = pose.attack !== null && pose.progress < this.previousProgress;
    if (this.state !== state || pose.time < this.previousTime || restartedAttack) {
      this.startedAt = pose.time;
      this.state = state;
    }
    this.previousTime = pose.time;
    this.previousProgress = pose.progress;
    if (!clip) return undefined;
    if (pose.attack && state !== 'hurt' && state !== 'death') {
      const progress = Number.isFinite(pose.progress) ? Math.max(0, Math.min(1, pose.progress)) : 0;
      return clip.frames[Math.min(clip.frames.length - 1, Math.floor(progress * clip.frames.length))];
    }
    const elapsed = Math.max(0, pose.time - this.startedAt);
    const index = Math.floor(elapsed * clip.frameRate / 1000);
    const looping = state === 'idle' || state === 'walk';
    return clip.frames[looping ? index % clip.frames.length : Math.min(index, clip.frames.length - 1)];
  }
}
