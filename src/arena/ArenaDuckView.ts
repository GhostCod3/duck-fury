import Phaser from 'phaser';
import { RigCharacterView } from '../art/rig/RigCharacterView';
import { RigState, type ArmPose, type RigPose } from '../art/rig/RigState';
import { aimBone, clamp, p, shift, smooth, type Vec } from '../art/rig/RigMath';
import type { RigAssets } from '../art/rig/rigAssets';
import type { ArenaActor, WeaponKind } from './ArenaWorld';

const VIEW_SCALE = .32;
class ShooterRig extends RigState {
  holding = false;
  recoil = 0;
  override worldPoint(local: Vec): Vec {
    // Arena roots use presentation units; the classic 2600-wide corpse clamp does not apply.
    const x = this.snapshot.x * VIEW_SCALE;
    const offset = this.pose.knockedOut ? (clamp(x,64,1216)-x) / VIEW_SCALE * smooth(this.deadTime/.95) : 0;
    return p(this.snapshot.x + offset + (local.x-250)*this.scale*this.snapshot.facing,this.snapshot.y+(local.y-382)*this.scale);
  }
  override arm(far: boolean, pose: RigPose = this.pose): ArmPose {
    if (!this.holding || pose.knockedOut) return super.arm(far, pose);
    const shoulder = far ? pose.farShoulder : pose.nearShoulder;
    const wrist = p(287 - this.recoil * 14 + (far ? 16 : 0), 170 + (far ? -8 : 0));
    const solved = aimBone(shoulder, wrist, shift(shoulder, -5, 60), 55);
    return { shoulder, elbow: solved.joint, wrist: solved.end };
  }
}

export class ArenaDuckView extends Phaser.GameObjects.Container {
  readonly rigState: ShooterRig;
  private rig?: RigCharacterView;
  private fallback: Phaser.GameObjects.Graphics;
  constructor(scene: Phaser.Scene, enemy: boolean, assets: RigAssets | undefined) {
    super(scene, 0, 0); scene.add.existing(this);
    this.rigState = new ShooterRig(enemy, { x: 500, y: 560, facing: enemy ? -1 : 1, moving: false, attack: null, progress: 0, hurt: false, dead: false, time: 0 });
    if (assets) { this.rig = new RigCharacterView(scene, enemy, assets, this.rigState.snapshot, this.rigState); this.rig.setScale(VIEW_SCALE); this.add(this.rig); }
    this.fallback = scene.add.graphics(); this.add(this.fallback); this.fallback.setVisible(!assets);
  }
  reset(actor: ArenaActor): void { this.rigState.reset(this.poseFor(actor)); }
  private poseFor(a: ArenaActor) { return { x: a.x / VIEW_SCALE, y: 560, facing: a.facing, moving: a.alive && Math.abs(a.vx) > 8 && a.grounded, attack: null, progress: 0, hurt: false, dead: !a.alive, time: 0 }; }
  advance(dt: number, actor: ArenaActor): void {
    this.setPosition(actor.x, actor.y - 6).setDepth(actor.alive ? 20 : 18);
    this.rigState.holding = !!actor.weapon; this.rigState.recoil = actor.flash / .065;
    this.rigState.advance(dt, this.poseFor(actor));
    if (actor.alive && !actor.grounded) {
      this.rigState.pose.front = { x: 280, y: 322, angle: -.25 };
      this.rigState.pose.back = { x: 221, y: 314, angle: .3 };
      this.rigState.pose.headAngle = -.06;
    }
    if (!this.rig) {
      const g = this.fallback; g.clear().fillStyle(actor.id === 'player' ? 0xe6b94f : 0x66c8c0);
      if (actor.alive) { g.fillRoundedRect(-16,-75,32,60,8); g.fillCircle(0,-84,18); g.fillStyle(0xe5a53d).fillTriangle(8 * actor.facing,-91,30 * actor.facing,-83,8 * actor.facing,-79); g.fillStyle(0x171d20).fillRect(-18,-17,15,16).fillRect(4,-17,15,16); }
      else g.fillRoundedRect(-36,-20,72,22,8);
    }
  }
}

/** Original procedural weapon silhouettes; no borrowed game assets. Origin is the grip. */
export function drawWeapon(g: Phaser.GameObjects.Graphics, kind: WeaponKind, x: number, y: number, facing = 1, scale = 1, flash = false): void {
  const rect = (rx: number, ry: number, w: number, h: number, color: number) => g.fillStyle(color).fillRect(x + (facing === 1 ? rx : -rx - w) * scale, y + ry * scale, w * scale, h * scale);
  if (kind === 'pistol') { rect(-7,-7,25,12,0x171f25); rect(-6,-9,26,4,0xc1c5bb); rect(16,-6,12,6,0x63716e); rect(-5,4,8,12,0x9d6540); }
  if (kind === 'shotgun') { rect(-15,-5,48,9,0x172226); rect(0,-9,35,4,0xafb9ac); rect(4,3,21,7,0xb4773e); rect(-18,2,17,11,0x855438); }
  if (kind === 'rocket') { rect(-16,-10,50,19,0x242f29); rect(-17,-12,9,23,0xa8a866); rect(7,-12,8,23,0x8d9b56); rect(-2,9,7,10,0x11191b); rect(28,-8,11,15,0xd9bd74); }
  if (flash) { g.fillStyle(0xffe6a0).fillTriangle(x + facing * 29 * scale,y - 10 * scale,x + facing * 55 * scale,y - 3 * scale,x + facing * 29 * scale,y + 7 * scale); }
}
