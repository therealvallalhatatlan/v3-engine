export type CharacterDNA = {
  sourceCharacterId?: string;
  alias?: string;
  identity: { name: string; archetype: string };
  physical: { face: string; body: string; posture: string };
  outfit: { top: string; bottom: string; accessories: string[] };
  anchors: string[];
  texture: { material: string; wear: string; dirt: string };
  energy: string;
  environmentAffinity: string[];
};

export type LocationPreset = string;
export type StylePreset = string;
export type ShotTemplate = 'establishing-wide' | 'medium-dialogue' | 'closeup-emotion' | 'over-shoulder' | 'insert-detail' | 'tracking-motion';
export type AspectRatio16x9 = 'landscape-16-9' | 'portrait-9-16';

export type SceneInput = {
  location: string;
  lighting?: string;
  /** @deprecated Use lighting instead. Kept for backwards-compatible prompt input. */
  mood?: string;
  actionPrompt?: string;
  castAliases?: string[];
  scenePackage?: ScenePackageInput;
  locationProfileId?: string;
  locationFingerprint?: string;
  aspectRatio: AspectRatio16x9;
  style: StylePreset;
  styleIntensity: number;
  camera: string;
  /** True when a separate environment/background reference image is supplied. */
  backgroundReference?: boolean;
  /** Generate an environment/background without any character identity constraints. */
  backgroundOnly?: boolean;
};

export type LocationProfile = {
  preset: LocationPreset;
  detail: string;
  geometry: string;
  lightingAndTime: string;
  paletteAndTexture: string;
  fixedProps: string;
  cameraContinuity: string;
};

export type LocationContinuity = {
  lockGeometry: boolean;
  lockLighting: boolean;
  lockPalette: boolean;
  lockProps: boolean;
  lockCameraRules: boolean;
  notes?: string;
};

export type ScenePackageInput = {
  locationProfileId?: string;
  locationProfile: LocationProfile;
  continuity: LocationContinuity;
  /** @deprecated Camera presets now define framing. Kept only for persisted/legacy scene packages. */
  shotTemplate?: ShotTemplate;
  bilingualInput?: { sourceLanguage: 'hu' | 'en' | 'mixed' };
};
