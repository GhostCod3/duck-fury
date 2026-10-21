import Phaser from 'phaser';

const WORLD_WIDTH = 2600;
const C = {
  ink: 0x292d29,
  sky: 0xabb3a3,
  light: 0xd1d0ad,
  dust: 0xa69c78,
  ground: 0x746f53,
  dark: 0x3c4540,
  rust: 0x9b583c,
  orange: 0xcf7544,
  yellow: 0xe4bc65,
};

/** All scenery is generated with Canvas/WebGL drawing commands, no art files. */
export function createWorld(scene: Phaser.Scene): void {
  const polygon = (g: Phaser.GameObjects.Graphics, points: number[], color: number, outline = false) => {
    g.fillStyle(color).lineStyle(3, C.ink, 1).beginPath().moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
    g.closePath().fillPath();
    if (outline) g.strokePath();
  };
  const line = (g: Phaser.GameObjects.Graphics, points: number[], color: number, width = 2, alpha = 1) => {
    g.lineStyle(width, color, alpha).beginPath().moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
    g.strokePath();
  };
  const text = (x: number, y: number, value: string, size: number, color: string, depth = -30) => {
    return scene.add.text(x, y, value, {
      fontFamily: 'Arial, sans-serif', fontSize: `${size}px`, fontStyle: 'bold', color,
    }).setDepth(depth);
  };

  // A dusty, layered horizon keeps the whole canvas alive as the camera travels.
  const sky = scene.add.graphics().setDepth(-100).setScrollFactor(0);
  sky.fillStyle(C.sky).fillRect(0, 0, 1280, 720);
  sky.fillStyle(0xbec1ab).fillRect(0, 94, 1280, 178);
  sky.fillStyle(C.light).fillRect(0, 272, 1280, 165);
  sky.fillStyle(0xe7d59b, 0.7).fillCircle(1048, 161, 74);
  sky.fillStyle(C.sky, 0.65).fillRect(940, 133, 260, 11);
  sky.fillStyle(C.sky, 0.55).fillRect(999, 169, 200, 7);
  line(sky, [30, 190, 260, 190], 0xe3dfba, 2, 0.4);
  line(sky, [72, 200, 156, 200], 0xe3dfba, 2, 0.4);

  const distant = scene.add.graphics().setDepth(-90).setScrollFactor(0.2, 1);
  polygon(distant, [0, 354, 70, 301, 132, 312, 212, 235, 285, 274, 339, 250, 430, 324, 517, 310, 599, 355, 710, 285, 790, 299, 869, 233, 956, 273, 1024, 248, 1160, 333, 1240, 312, 1350, 365, 1510, 270, 1620, 304, 1800, 340, 1800, 460, 0, 460], 0x8d9684);
  polygon(distant, [132, 312, 212, 235, 239, 294, 285, 274, 271, 323, 191, 345], 0xa3a88f);
  polygon(distant, [790, 299, 869, 233, 889, 282, 956, 273, 925, 320, 850, 340], 0xa3a88f);
  const mid = scene.add.graphics().setDepth(-80).setScrollFactor(0.4, 1);
  polygon(mid, [0, 384, 144, 352, 245, 374, 380, 330, 501, 371, 653, 339, 777, 380, 951, 350, 1120, 386, 1289, 327, 1458, 364, 1640, 334, 1900, 385, 2200, 360, 2600, 380, 2600, 476, 0, 476], 0x777f6b);
  for (const x of [115, 374, 1420, 1760, 2140]) {
    mid.fillStyle(0x677363).fillRect(x, 288, 41, 93).fillRect(x + 45, 323, 61, 59);
    line(mid, [x + 10, 288, x + 14, 249, x + 21, 286], 0x677363, 4);
    line(mid, [x + 53, 323, x + 65, 297, x + 85, 310], 0x677363, 3);
  }

  const ground = scene.add.graphics().setDepth(-60);
  ground.fillStyle(C.dust).fillRect(0, 410, WORLD_WIDTH, 310);
  polygon(ground, [0, 465, 590, 446, 1040, 455, 1480, 432, 2600, 461, 2600, 720, 0, 720], C.ground);
  polygon(ground, [0, 607, 2600, 571, 2600, 720, 0, 720], 0x6c6951);
  line(ground, [0, 458, 580, 445, 1020, 453, 1510, 432, 2600, 459], 0xc2b78b, 4, 0.6);
  // Seeded, repeatable grit and painted road fragments.
  let seed = 47;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 210; i++) {
    const x = rand() * WORLD_WIDTH;
    const y = 453 + rand() * 265;
    line(ground, [x, y, x + 3 + rand() * 18, y - 1], i % 3 === 0 ? 0xb0a57b : 0x4e5543, 1 + rand(), 0.45);
  }
  for (let x = 60; x < WORLD_WIDTH; x += 240) {
    polygon(ground, [x, 575, x + 103, 572, x + 114, 581, x + 6, 585], 0xa9a076);
    line(ground, [x + 27, 575, x + 33, 583], C.ground, 3);
  }
  for (let x = 80; x < WORLD_WIDTH; x += 370) {
    line(ground, [x, 674, x + 61, 650, x + 95, 656, x + 128, 632], 0x454d3e, 2, 0.8);
    line(ground, [x + 61, 650, x + 54, 625], 0x454d3e, 2, 0.8);
  }

  // Utility poles and hand-laid wire silhouettes make an abandoned route.
  const utilities = scene.add.graphics().setDepth(-45);
  for (const x of [125, 1570, 2480]) {
    polygon(utilities, [x, 427, x + 7, 165, x + 17, 164, x + 12, 427], 0x454c41, true);
    line(utilities, [x - 45, 191, x + 59, 191], C.ink, 8);
    for (let k = -1; k <= 1; k++) line(utilities, [x + k * 37 + 8, 191, x + k * 37 + 8, 178], C.ink, 5);
  }
  line(utilities, [0, 194, 130, 185, 380, 220, 720, 238, 1090, 219, 1580, 185, 1950, 229, 2230, 215, 2490, 185, 2600, 198], 0x465045, 2);
  line(utilities, [0, 205, 130, 193, 380, 233, 720, 249, 1090, 232, 1580, 193, 1950, 242, 2230, 227, 2490, 193, 2600, 210], 0x465045, 1.5);

  // Original gas station: low concrete store, salvaged canopy, empty pumps.
  const station = scene.add.graphics().setDepth(-35);
  station.fillStyle(0x4a503f, 0.35).fillEllipse(975, 446, 860, 37);
  polygon(station, [700, 272, 1107, 272, 1142, 300, 1142, 435, 700, 435], 0xa49d78, true);
  polygon(station, [1107, 272, 1142, 300, 1142, 435, 1107, 425], 0x7c7e62, true);
  station.fillStyle(0x737960).fillRect(701, 403, 406, 29);
  polygon(station, [682, 267, 1112, 267, 1149, 291, 691, 291], 0x454e43, true);
  station.fillStyle(0x2d3934).lineStyle(4, 0x716f53).fillRect(728, 320, 155, 78).strokeRect(728, 320, 155, 78);
  line(station, [779, 320, 779, 397], 0x69755e, 4);
  line(station, [831, 320, 831, 397], 0x69755e, 4);
  line(station, [729, 358, 882, 358], 0x69755e, 4);
  polygon(station, [736, 322, 760, 322, 735, 351], 0x718270);
  polygon(station, [838, 322, 876, 322, 846, 354, 838, 350], 0x718270);
  polygon(station, [731, 384, 875, 337, 881, 348, 735, 398], 0x7d6846, true);
  station.fillStyle(0x323d33).lineStyle(4, C.ink).fillRect(915, 314, 65, 116).strokeRect(915, 314, 65, 116);
  station.fillStyle(0x68735c).fillRect(923, 324, 48, 57);
  line(station, [931, 330, 958, 330, 931, 359], 0x85917a, 2);
  station.fillStyle(C.yellow).fillRect(967, 390, 4, 10);
  station.fillStyle(0x6f735b).fillRect(1003, 327, 85, 65);
  for (let y = 334; y <= 387; y += 9) line(station, [1006, y, 1085, y], 0x505b48, 3);
  line(station, [1023, 403, 1023, 414, 1044, 420, 1038, 433], 0x626a52, 2);
  text(733, 298, 'LAST STOP. NO PROMISES.', 11, '#dad1a4', -34).setLetterSpacing(2.3);

  // Canopy carries the scene's central typographic landmark.
  for (const x of [609, 1274]) {
    polygon(station, [x, 222, x + 16, 222, x + 12, 445, x - 3, 445], 0x505a4c, true);
    station.fillStyle(C.rust).fillRect(x - 1, 337, 14, 106);
    station.fillStyle(0x323d32).fillRect(x - 7, 438, 26, 8);
    line(station, [x + 3, 251, x + 3, 335], 0x8b9277, 2);
  }
  polygon(station, [566, 190, 1255, 190, 1329, 227, 605, 227], 0x9c6749, true);
  polygon(station, [605, 227, 1329, 227, 1329, 253, 605, 253], 0x424c40, true);
  polygon(station, [566, 190, 605, 227, 605, 253, 566, 215], 0x683f31, true);
  polygon(station, [566, 190, 1255, 190, 1270, 199, 576, 199], 0xc78a54);
  polygon(station, [605, 228, 1328, 228, 1328, 236, 605, 236], C.yellow);
  line(station, [648, 244, 717, 244], 0x819078, 3);
  line(station, [1007, 244, 1095, 244], 0x819078, 3);
  polygon(station, [1000, 190, 1010, 205, 1032, 211, 1026, 226, 1046, 227, 1040, 202, 1020, 190], 0x615446);
  text(758, 194, 'DUST  //  FUEL', 28, '#ede0b8', -34).setLetterSpacing(3);

  const pump = (x: number, label: string) => {
    const g = scene.add.graphics().setDepth(446);
    g.fillStyle(0x283329, 0.28).fillEllipse(x + 5, 447, 96, 15);
    polygon(g, [x - 27, 438, x - 24, 357, x + 25, 357, x + 29, 438], 0x9c6043, true);
    polygon(g, [x - 29, 318, x + 27, 318, x + 30, 363, x - 29, 363], 0xb5b497, true);
    g.fillStyle(0x303d34).fillRect(x - 19, 329, 37, 19);
    g.fillStyle(0xbfc2a0).fillRect(x - 13, 336, 8, 3).fillRect(x + 3, 336, 8, 3);
    g.fillStyle(0x5d4e35).fillRect(x - 14, 379, 26, 29);
    line(g, [x - 29, 328, x - 41, 336, x - 43, 401, x - 33, 420, x - 26, 414], C.ink, 5);
    line(g, [x - 31, 332, x - 37, 343], 0x929880, 4);
    g.fillStyle(0x3b4438).fillRect(x - 34, 435, 70, 10);
    line(g, [x + 16, 371, x + 13, 389, x + 20, 399], 0x704735, 2);
    text(x - 8, 384, label, 13, '#d4bd83', 447);
  };
  pump(650, '01');
  pump(1216, '02');

  // Broken roadside pylon, with a deliberately irregular silhouette.
  const sign = scene.add.graphics().setDepth(-32);
  polygon(sign, [379, 443, 389, 192, 402, 191, 394, 443], 0x535b49, true);
  polygon(sign, [321, 157, 464, 157, 477, 178, 464, 235, 322, 235, 311, 216], 0x3c4a3d, true);
  polygon(sign, [322, 158, 463, 158, 468, 169, 318, 169], C.orange);
  text(334, 176, 'DUST', 28, '#dfd4ab', -31).setLetterSpacing(4);
  text(338, 209, 'FUEL & REPAIR', 10, '#c3bd91', -31).setLetterSpacing(1);
  polygon(sign, [334, 253, 447, 253, 443, 305, 332, 305], 0x454f3e, true);
  line(sign, [344, 265, 365, 265, 365, 273, 343, 273, 343, 282, 365, 282], C.yellow, 3);
  line(sign, [387, 264, 386, 284], C.yellow, 3);
  line(sign, [408, 266, 429, 264, 430, 283, 409, 283, 408, 266], C.yellow, 3);
  line(sign, [367, 253, 371, 271, 381, 279, 375, 306], C.ink, 3);
  polygon(sign, [343, 321, 439, 321, 449, 335, 436, 348, 340, 348], C.rust, true);
  text(352, 326, 'DRY SINCE ’89', 10, '#e1d2a7', -31);

  // Salvage at the far end of the scrolling road.
  const salvage = scene.add.graphics().setDepth(448);
  salvage.fillStyle(0x394331, 0.3).fillEllipse(1850, 442, 373, 29);
  polygon(salvage, [1701, 408, 1744, 390, 1778, 349, 1884, 352, 1923, 391, 1982, 401, 1988, 431, 1699, 431], 0x806348, true);
  polygon(salvage, [1785, 359, 1820, 359, 1818, 388, 1759, 388], 0x35463c, true);
  polygon(salvage, [1831, 360, 1876, 362, 1903, 389, 1830, 388], 0x35463c, true);
  line(salvage, [1705, 403, 1800, 409, 1978, 405], 0xb48b5c, 3);
  line(salvage, [1825, 395, 1823, 424], 0x493f32, 3);
  salvage.fillStyle(C.ink).fillCircle(1752, 428, 28).fillCircle(1921, 428, 28);
  salvage.fillStyle(0x6f7760).fillCircle(1752, 428, 14).fillCircle(1921, 428, 14);
  salvage.fillStyle(C.ink).fillCircle(1752, 428, 5).fillCircle(1921, 428, 5);
  polygon(salvage, [1938, 397, 1993, 379, 1999, 386, 1979, 405], 0x58604a, true);
  line(salvage, [1768, 345, 1772, 333, 1900, 333, 1903, 350], C.ink, 4);
  for (const x of [1785, 1815, 1855]) line(salvage, [x, 333, x + 5, 349], C.ink, 3);

  const barrel = (x: number, y: number, color: number) => {
    const g = scene.add.graphics().setDepth(y);
    g.fillStyle(0x2c382d, 0.28).fillEllipse(x + 8, y, 70, 15);
    g.fillStyle(color).lineStyle(2.5, C.ink).fillRoundedRect(x - 24, y - 66, 48, 66, 6).strokeRoundedRect(x - 24, y - 66, 48, 66, 6);
    g.fillStyle(0x676c53).fillEllipse(x, y - 64, 46, 11);
    line(g, [x - 23, y - 48, x + 23, y - 48], C.ink, 4);
    line(g, [x - 23, y - 15, x + 23, y - 15], C.ink, 4);
    line(g, [x - 12, y - 45, x - 15, y - 30, x - 10, y - 23], 0xb3895c, 2);
    g.fillStyle(0x3c4636).fillEllipse(x + 9, y - 65, 8, 4);
  };
  barrel(1511, 448, 0x8b5039);
  barrel(1561, 451, 0x606b4f);
  barrel(2280, 440, 0x82543c);

  // Near-camera silhouette fragments frame the stage, leaving fighting lanes clear.
  const foreground = scene.add.graphics().setDepth(690);
  for (const x of [74, 1390, 2210]) {
    polygon(foreground, [x, 720, x + 23, 672, x + 33, 704, x + 45, 678, x + 49, 713, x + 65, 695, x + 65, 720], 0x424b38);
    line(foreground, [x + 36, 718, x + 14, 692, x + 10, 680], 0x424b38, 3);
  }
  polygon(foreground, [191, 720, 206, 694, 248, 687, 286, 702, 293, 720], 0x3e4838, true);
  polygon(foreground, [208, 694, 248, 688, 262, 701, 229, 705], 0x697056);
  // Atmospheric dust trails, completely passive decoration.
  const air = scene.add.graphics().setDepth(700).setScrollFactor(0.75, 1);
  for (let i = 0; i < 24; i++) {
    const x = rand() * 2100;
    const y = 290 + rand() * 340;
    line(air, [x, y, x + 16 + rand() * 25, y - 1], 0xe4d7a5, 1, 0.24);
  }
}
