import Phaser from 'phaser';

export interface DuckPose {
  facing: 1 | -1;
  moving: boolean;
  attack: 'punch1' | 'punch2' | 'punch3' | 'kick' | 'enemy' | null;
  progress: number;
  hurt: boolean;
  dead: boolean;
  time: number;
}

/** Original, deliberately graphic placeholder character, anchored at its feet. */
export class DuckView extends Phaser.GameObjects.Container {
  private readonly ink: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly enemy: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number, enemy: boolean) {
    super(scene, x, y);
    this.enemy = enemy;
    this.shadow = scene.add.graphics();
    this.ink = scene.add.graphics();
    this.add([this.shadow, this.ink]);
    scene.add.existing(this);
    this.renderPose({ facing: 1, moving: false, attack: null, progress: 0, hurt: false, dead: false, time: 0 });
  }

  renderPose(pose: DuckPose): void {
    const g = this.ink;
    const outline = 0x191c1b;
    const feather = pose.hurt ? 0xfff2cf : this.enemy ? 0xa6a38d : 0xe2dfc6;
    const featherShade = this.enemy ? 0x777d70 : 0xb6b9a2;
    const armor = this.enemy ? 0x71473b : 0x465451;
    const armorShade = this.enemy ? 0x4d342e : 0x303d3c;
    const metal = 0x9ca490;
    const orange = this.enemy ? 0xe99746 : 0xc65b37;
    const bob = pose.moving && !pose.dead ? Math.sin(pose.time * 0.016) * 3 : Math.sin(pose.time * 0.004) * 1.2;
    const walk = pose.moving && !pose.dead ? Math.sin(pose.time * 0.016) * 11 : 0;
    const hit = pose.attack ? Math.sin(Math.min(1, pose.progress * 1.35) * Math.PI) : 0;
    const punch = pose.attack && pose.attack !== 'kick' ? hit : 0;
    const kick = pose.attack === 'kick' ? hit : 0;

    g.clear();
    this.shadow.clear().fillStyle(0x161d1a, 0.3).fillEllipse(0, -1, pose.dead ? 125 : 84, 19);
    g.setScale(pose.facing, 1);
    g.rotation = pose.dead ? -1.45 : 0;
    g.setPosition(pose.dead ? -44 * pose.facing : 0, pose.dead ? -9 : bob);

    const poly = (points: number[], color: number, width = 2.8) => {
      g.fillStyle(color).lineStyle(width, outline, 1);
      g.beginPath();
      g.moveTo(points[0], points[1]);
      for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
      g.closePath().fillPath().strokePath();
    };
    const ellipse = (x: number, y: number, w: number, h: number, color: number, width = 2.8) => {
      g.fillStyle(color).lineStyle(width, outline, 1).fillEllipse(x, y, w, h).strokeEllipse(x, y, w, h);
    };
    const line = (points: number[], color: number, width: number, alpha = 1) => {
      g.lineStyle(width, color, alpha).beginPath().moveTo(points[0], points[1]);
      for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
      g.strokePath();
    };

    // Rear arm and leg establish a readable fighting stance.
    ellipse(-30, -88, 29, 35, featherShade);
    poly([-34, -82, -46, -59, -33, -49, -18, -72], featherShade);
    ellipse(-36, -53, 24, 23, armorShade);
    poly([-22, -48, -3, -48, -5 + walk, -18, -26 + walk, -15], armorShade);
    poly([-26 + walk, -21, -7 + walk, -20, -3 + walk, -8, 8 + walk, -4, 7 + walk, 2, -31 + walk, 2, -33 + walk, -6], 0xbd873e);
    line([-25 + walk, -3, -14 + walk, -3, -11 + walk, 0], 0x805f37, 2);

    // Tail, trousers, and an asymmetrical salvaged armor vest.
    poly([-23, -63, -42, -67, -35, -57, -46, -55, -25, -43], feather);
    ellipse(-1, -57, 49, 38, armorShade);
    poly([-27, -111, 6, -115, 28, -102, 29, -68, 15, -51, -21, -53, -33, -79], armor);
    poly([-27, -103, -10, -109, -8, -63, -23, -65], armorShade, 1.5);
    poly([-6, -106, 20, -99, 22, -76, 1, -71], 0x6a7670, 1.6);
    line([0, -98, 14, -94, 16, -83], 0xa2a99a, 2);
    line([-24, -106, 15, -56], 0x252c29, 10);
    line([-24, -106, 15, -56], 0x8d7252, 6);
    poly([-26, -64, 26, -64, 22, -53, -23, -53], 0x232b28, 2);
    poly([-4, -65, 8, -65, 8, -54, -4, -54], metal, 1.8);
    g.fillStyle(outline).fillRect(-1, -62, 6, 5);
    g.fillStyle(0xb7b6a0).fillCircle(-18, -91, 2).fillCircle(17, -69, 2);
    line([5, -89, 10, -85, 5, -80], 0xd0d0b8, 1.5);

    // Leading leg extends into a straight, visibly longer kick.
    const kneeX = 13 + kick * 43 - walk;
    const kneeY = -29 - kick * 22;
    const footX = 19 + kick * 88 - walk;
    const footY = -5 - kick * 42;
    poly([2, -51, 23, -50, kneeX + 10, kneeY, footX + 4, footY - 5, footX - 13, footY - 1, kneeX - 9, kneeY + 7], armor);
    ellipse(kneeX, kneeY, 22, 19, metal, 2.1);
    line([kneeX - 7, kneeY, kneeX + 6, kneeY - 2], 0x596662, 2);
    poly([footX - 13, footY - 10, footX + 4, footY - 12, footX + 11, footY - 4, footX + 27, footY, footX + 27, footY + 7, footX - 15, footY + 7], 0xd29943);
    line([footX + 3, footY + 2, footX + 19, footY + 2], 0x8e683b, 2);

    // Rust scarf and a broad duck head. The beak and brow provide the identity.
    poly([-20, -121, 12, -121, 21, -107, 1, -101, -24, -108], orange, 2.5);
    poly([-19, -113, -49, -121, -43, -109, -55, -102, -24, -105], orange, 2.5);
    line([-18, -115, 8, -111], 0x813b2b, 2);
    ellipse(-1, -135, 47, 44, feather);
    poly([-22, -138, -27, -128, -19, -130, -22, -119, -12, -123, -7, -115, 2, -121], feather, 1.2);
    ellipse(13, -135, 18, 19, feather, 1.4);
    poly([12, -128, 32, -132, 46, -124, 44, -116, 22, -113, 11, -119], 0xd8a249, 2.6);
    line([19, -119, 39, -120], 0x866332, 2);
    g.fillStyle(0x302d24).fillCircle(32, -125, 1.6);

    if (this.enemy) {
      poly([-18, -151, -14, -165, -6, -160, 2, -173, 7, -159, 17, -165, 19, -150], 0xcb693a, 2.5);
      poly([-24, -151, 14, -153, 22, -141, -24, -140], 0x3e4540, 2);
      line([-17, -147, 14, -147], 0x7e8b79, 2);
    } else {
      poly([-24, -146, -18, -154, 13, -153, 22, -144, 18, -137, -24, -138], 0x3c4b48, 2.7);
      poly([-17, -151, 11, -150, 12, -144, -18, -144], 0x6f7f71, 1.3);
      g.fillStyle(0xc9ae64).fillRect(-9, -150, 5, 7);
      poly([-24, -142, -35, -140, -29, -132, -18, -137], orange, 2);
    }
    // Small furious eye below the angled brow; cross marks when downed.
    if (pose.dead) {
      line([9, -138, 15, -132], outline, 2);
      line([15, -138, 9, -132], outline, 2);
    } else {
      g.fillStyle(0xf0eedc).fillEllipse(12, -136, 9, 7);
      g.fillStyle(outline).fillCircle(15, -135, 2.6);
      line([6, -141, 18, -138], outline, 3.5);
    }

    // Foreground shoulder, bicep, and wrapped fist. Combo hits vary in height.
    const uppercut = pose.attack === 'punch3' ? 28 * punch : 0;
    const cross = pose.attack === 'punch2' ? 9 * punch : 0;
    const fistX = 36 + punch * 69;
    const fistY = -83 - punch * 11 - uppercut + cross;
    ellipse(24, -99, 31, 29, feather);
    poly([28, -106, 41 + punch * 29, -95 - uppercut * 0.5, fistX + 1, fistY - 8, fistX + 1, fistY + 10, 36, -79, 19, -84], feather);
    line([28, -94, 34 + punch * 21, -88 - uppercut * 0.5], featherShade, 3.5);
    poly([15, -113, 30, -115, 40, -103, 32, -96, 16, -101], this.enemy ? 0x434d45 : 0x8b9380, 2.5);
    if (this.enemy) {
      poly([20, -113, 20, -125, 28, -115], metal, 1.6);
      poly([31, -111, 37, -122, 39, -106], metal, 1.6);
    }
    ellipse(fistX, fistY, 30, 25, 0x414b43, 2.5);
    poly([fistX - 12, fistY - 10, fistX + 8, fistY - 11, fistX + 12, fistY + 1, fistX - 10, fistY + 4], 0xb7b39a, 1.5);
    line([fistX - 6, fistY - 9, fistX - 3, fistY + 1], 0x747b6b, 2);
    line([fistX + 1, fistY - 9, fistX + 4, fistY + 1], 0x747b6b, 2);

    // A brief, thin motion arc emphasizes the active part of attacks.
    if (pose.attack && hit > 0.55 && !pose.dead) {
      const alpha = Math.min(0.65, hit - 0.3);
      if (pose.attack === 'kick') {
        line([51, -75, 83, -67, 114, -46], 0xffdc8d, 3, alpha);
      } else {
        line([56, fistY - 22, 84, fistY - 20, 111, fistY - 10], 0xffdc8d, 3, alpha);
      }
    }
  }
}
