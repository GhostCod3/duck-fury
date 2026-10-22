import Phaser from 'phaser';
import { RigState, type RigSnapshot } from './RigState';
import { clamp, lerp, p, rotate, shift, smooth, solveLeg, type Vec } from './RigMath';
import { variantKey, type PartName, type RigAssets, type PartImage } from './rigAssets';

const PIVOTS: Partial<Record<PartName, readonly number[]>> = {
  torso: [.64, .055, .48, .88], upperArm: [.49, .18, .55, .88], farUpperArm: [.48, .18, .59, .88],
  forearm: [.17, .15, .78, .79], farForearm: [.19, .15, .78, .79], thigh: [.43, .1, .59, .83], farThigh: [.43, .1, .59, .83],
  shin: [.42, .1, .42, .72], farShin: [.42, .1, .42, .72],
};
const WOUNDS = {
  head: [[.42, .49, .032], [.55, .55, .025], [.34, .54, .027], [.46, .40, .023]],
  torso: [[.67, .29, .043], [.61, .43, .049], [.51, .55, .038], [.72, .38, .034]],
};

/** A Phaser Canvas render hook, not a second canvas/game loop or per-frame raster texture. */
export class RigCharacterView extends Phaser.GameObjects.Container {
  readonly rigState: RigState;
  private readonly assets: RigAssets;
  constructor(scene: Phaser.Scene, enemy: boolean, assets: RigAssets, snapshot: RigSnapshot) {
    super(scene, 0, 0); this.assets = assets; this.rigState = new RigState(enemy, snapshot); scene.add.existing(this);
  }

  private part(name: PartName, dark = false): PartImage {
    return this.assets.variants[variantKey(this.rigState.enemy, dark, this.rigState.flash > 0)]?.[name]
      ?? this.assets.variants[variantKey(this.rigState.enemy, false, this.rigState.flash > 0)]![name]!;
  }

  renderCanvas(renderer: Phaser.Renderer.Canvas.CanvasRenderer, src: RigCharacterView, camera: Phaser.Cameras.Scene2D.Camera, parentMatrix?: Phaser.GameObjects.Components.TransformMatrix): void {
    const ctx = renderer.currentContext;
    if (!Phaser.Renderer.Canvas.SetTransform(renderer, ctx, src, camera, parentMatrix)) return;
    try { this.draw(ctx); } finally { ctx.restore(); }
  }

  private draw(ctx: CanvasRenderingContext2D): void {
    const a = this.rigState, pose = a.pose, fall = pose.knockedOut ? smooth(a.deadTime / .95) : 0;
    const offset = a.worldPoint(p(250, 382)).x - a.snapshot.x;
    ctx.translate(offset, 0); ctx.scale(a.scale * a.snapshot.facing, a.scale); ctx.translate(-250, -382);
    ctx.save(); ctx.fillStyle = '#292e29'; ctx.globalAlpha *= .13;
    ctx.beginPath(); ctx.ellipse(250, 384, lerp(77, 171, fall), lerp(8, 13, fall), 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    if (pose.knockedOut) {
      const o = rotate(p(-10, 9), pose.bodyRotation!); this.scarf(ctx, shift(pose.neck, o.x + 10, o.y - 9), true);
    } else this.scarf(ctx, pose.neck, false);
    this.arm(ctx, true); this.leg(ctx, true, pose.leftHip, pose.back, pose.backKnee);
    this.leg(ctx, false, pose.rightHip, pose.front, pose.frontKnee);
    this.piece(ctx, 'torso', pose.neck, shift(pose.hip, 0, 10));
    const head = this.part((pose.knockedOut && a.deadTime > .16) || pose.idle?.blink ? 'headKO' : 'head');
    const origin = pose.headOrigin ?? shift(pose.neck, -4, -10);
    ctx.save(); ctx.translate(origin.x, origin.y); ctx.rotate(pose.headAngle);
    ctx.drawImage(head.image, -42, -65, 90, 104); ctx.translate(-42, -65); this.wounds(ctx, 'head', 90, 104); ctx.restore();
    this.arm(ctx, false);
  }

  private wounds(ctx: CanvasRenderingContext2D, region: keyof typeof WOUNDS, width: number, height: number): void {
    if (!this.rigState.wounds) return;
    ctx.save(); ctx.fillStyle = ctx.strokeStyle = '#b52c38'; ctx.lineCap = 'round';
    const sites = WOUNDS[region];
    for (let i = 0; i < Math.min(this.rigState.wounds, sites.length); i++) {
      const [u, v, size] = sites[i], x = u * width, y = v * height, r = size * width;
      ctx.globalAlpha = .8; ctx.beginPath();
      for (let n = 0; n < 12; n++) {
        const angle = n * Math.PI / 6, rad = r * (n % 2 ? .62 : 1) * (1 + .12 * Math.sin(i * 7 + n * 3));
        const px = x + Math.cos(angle) * rad, py = y + Math.sin(angle) * rad * .72;
        if (n) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = .65; ctx.lineWidth = r * .32;
      ctx.beginPath(); ctx.moveTo(x + r * .18, y); ctx.quadraticCurveTo(x + r * .4, y + r * .8, x + r * .3, y + r * 1.65); ctx.stroke();
      ctx.globalAlpha = .72;
      for (let n = 0; n < 3; n++) { const angle = i * 1.3 + n * 2.1; ctx.beginPath(); ctx.ellipse(x + Math.cos(angle) * r * 1.5, y + Math.sin(angle) * r * 1.1, r * .16, r * .12, angle, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  private piece(ctx: CanvasRenderingContext2D, name: PartName, a: Vec, b: Vec, opts: { dark?: boolean; clip?: [number, number]; pivots?: number[]; thickness?: number } = {}): void {
    const im = this.part(name, opts.dark), v = opts.pivots ?? PIVOTS[name] ?? [.5, 0, .5, 1];
    const sx = v[0] * im.width, sy = v[1] * im.height, tx = v[2] * im.width, ty = v[3] * im.height;
    const worldAngle = Math.atan2(b.y - a.y, b.x - a.x), sourceAngle = Math.atan2(ty - sy, tx - sx);
    const scale = Math.hypot(b.x - a.x, b.y - a.y) / Math.hypot(tx - sx, ty - sy);
    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(worldAngle); ctx.scale(scale, scale * (opts.thickness ?? 1)); ctx.rotate(-sourceAngle);
    if (opts.clip) {
      const y = im.height * opts.clip[0], h = im.height * (opts.clip[1] - opts.clip[0]);
      ctx.drawImage(im.image, 0, y, im.width, h, -sx, y - sy, im.width, h);
    } else ctx.drawImage(im.image, -sx, -sy);
    if (name === 'torso') { ctx.save(); ctx.translate(-sx, -sy); this.wounds(ctx, 'torso', im.width, im.height); ctx.restore(); }
    ctx.restore();
  }

  private leg(ctx: CanvasRenderingContext2D, far: boolean, hip: Vec, ankle: Vec & { angle: number }, kneeOverride?: Vec): void {
    const knee = kneeOverride ?? solveLeg(hip, ankle), name = far ? 'farShin' : 'shin', im = this.part(name, far);
    this.piece(ctx, name, knee, ankle, { dark: far, clip: [.34, .72], pivots: [.42, .28, .42, .72], thickness: .71 });
    const scale = 65 / (im.height * .62), cut = im.height * .59;
    ctx.save(); ctx.translate(ankle.x, ankle.y); ctx.rotate(ankle.angle);
    ctx.drawImage(im.image, 0, cut, im.width, im.height - cut, -im.width * .42 * scale, (cut - im.height * .72) * scale, im.width * scale, (im.height - cut) * scale); ctx.restore();
    this.piece(ctx, far ? 'farThigh' : 'thigh', hip, knee, { dark: far });
  }

  private arm(ctx: CanvasRenderingContext2D, far: boolean): void {
    const arm = this.rigState.arm(far);
    this.piece(ctx, far ? 'farUpperArm' : 'upperArm', arm.shoulder, arm.elbow, { dark: far, thickness: 1.18 });
    this.piece(ctx, far ? 'farForearm' : 'forearm', arm.elbow, arm.wrist, { dark: far, thickness: 1.18 });
  }

  private scarf(ctx: CanvasRenderingContext2D, neck: Vec, dead: boolean): void {
    const im = this.part('scarfTail'), a = this.rigState, s = a.spring;
    ctx.save(); ctx.translate(neck.x - 10, neck.y + 9); ctx.rotate(s.a);
    for (let i = 0; i < 16; i++) {
      const t = i / 16, t2 = (i + 1) / 16, dx = -118 * t, dx2 = -118 * t2;
      const curve = (u: number) => s.b * u * u + 8 * Math.sin(u * 5 - a.time * 7) * u * (dead ? 0 : a.wind);
      const dy = curve(t), dy2 = curve(t2), angle = Math.atan2(dy2 - dy, dx2 - dx) - Math.PI;
      ctx.save(); ctx.translate(dx, dy); ctx.rotate(angle);
      ctx.drawImage(im.image, im.width * (1 - t2), 0, im.width / 16 + 1, im.height, -118 / 16 - 1, -22, 118 / 16 + 2, 44); ctx.restore();
    }
    ctx.restore();
  }
}
