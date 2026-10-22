import Phaser from 'phaser';

export const PART_DIMENSIONS = {
  head: [290, 289], headKO: [290, 290], torso: [230, 290],
  upperArm: [168, 272], forearm: [235, 234], farUpperArm: [174, 270], farForearm: [220, 252],
  thigh: [178, 290], shin: [198, 290], farThigh: [179, 290], farShin: [212, 290], scarfTail: [235, 118],
} as const;
export type PartName = keyof typeof PART_DIMENSIONS;
export interface PartImage { image: CanvasImageSource; width: number; height: number }
export type PartPack = Partial<Record<PartName, PartImage>>;
export interface RigAssets { variants: Record<string, PartPack>; resourceCount: number }
export const PANORAMA_KEY = 'approved-rig:panorama';
const loaded = new WeakMap<Phaser.Scene, RigAssets>();
const farParts = new Set<PartName>(['farUpperArm', 'farForearm', 'farThigh', 'farShin']);
export const variantKey = (enemy: boolean, dark: boolean, flash: boolean) => `${enemy ? 'enemy' : 'normal'}${dark ? 'Far' : ''}${flash ? 'Flash' : ''}`;

export function preloadRigAssets(scene: Phaser.Scene): void {
  loaded.delete(scene);
  const root = `${import.meta.env.BASE_URL}assets/`;
  for (const name of Object.keys(PART_DIMENSIONS) as PartName[]) scene.load.image(`approved-rig:${name}`, `${root}rig/${name}.webp`);
  scene.load.image(PANORAMA_KEY, `${root}world/scrap-road.webp`);
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
    const original: PartPack = {};
    for (const name of Object.keys(PART_DIMENSIONS) as PartName[]) {
      const key = `approved-rig:${name}`;
      if (!scene.textures.exists(key)) { console.warn(`[DUCK FURY rig] Missing ${name}; using character fallback.`); return; }
      const image = scene.textures.get(key).getSourceImage() as HTMLImageElement;
      const [width, height] = PART_DIMENSIONS[name];
      if (image.width !== width || image.height !== height) { console.warn(`[DUCK FURY rig] Invalid dimensions for ${name}; using character fallback.`); return; }
      original[name] = { image, width, height };
    }
    const variants: RigAssets['variants'] = {};
    let resourceCount = 0;
    try {
      for (const enemy of [false, true]) for (const dark of [false, true]) for (const flash of [false, true]) {
        const pack: PartPack = variants[variantKey(enemy, dark, flash)] = {};
        for (const name of Object.keys(PART_DIMENSIONS) as PartName[]) {
          if (dark && !farParts.has(name)) continue;
          const part = original[name]!;
          if (!enemy && !dark && !flash) { pack[name] = part; resourceCount++; continue; }
          const canvas = document.createElement('canvas'); canvas.width = part.width; canvas.height = part.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('2D canvas unavailable');
          const filters = [];
          if (enemy) filters.push('hue-rotate(170deg) saturate(.72) brightness(.92)');
          if (dark) filters.push('brightness(.72) saturate(.82)');
          if (flash) filters.push('brightness(1.7)');
          ctx.filter = filters.join(' '); ctx.drawImage(part.image, 0, 0); ctx.filter = 'none';
          pack[name] = { image: canvas, width: part.width, height: part.height }; resourceCount++;
        }
      }
      loaded.set(scene, { variants, resourceCount });
    } catch (error) { console.warn('[DUCK FURY rig] Variant preparation failed; using character fallback.', error); }
  });
}
export const getRigAssets = (scene: Phaser.Scene): RigAssets | undefined => loaded.get(scene);
