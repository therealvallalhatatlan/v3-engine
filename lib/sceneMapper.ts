import { LocationPreset, SceneInput, ShotTemplate } from '../types/prompt';
import { getPreset, getPresetsByType } from './presetStore';

const MOOD_MAP: Record<string, string> = {
  paras: 'tense, paranoid atmosphere, unease',
  szetesett: 'chaotic, disoriented atmosphere',
  euforikus: 'intense, euphoric atmosphere',
};

export const LOCATION_PRESET_MAP: Record<string, string> = Object.fromEntries(
  getPresetsByType('location').map((preset) => [preset.key, preset.prompt])
);

const SHOT_TEMPLATE_MAP: Record<ShotTemplate, string> = {
  'establishing-wide': 'Establishing wide shot; prioritize spatial readability of the full location.',
  'medium-dialogue': 'Medium dialogue framing; preserve eyeline logic and interaction blocking.',
  'closeup-emotion': 'Close-up emotion shot; preserve facial clarity while keeping environment continuity cues.',
  'over-shoulder': 'Over-the-shoulder composition; maintain axis continuity and readable foreground shoulder silhouette.',
  'insert-detail': 'Insert detail shot; emphasize key object/action while preserving material continuity.',
  'tracking-motion': 'Tracking motion-oriented framing; keep movement believable and spatial continuity intact.',
};

const HU_TO_EN_GLOSSARY: Array<[RegExp, string]> = [
  [/belso\s*ter|belt[eé]r/gi, 'interior space'],
  [/kulso\s*ter|k[uü]lt[eé]r/gi, 'exterior space'],
  [/ejjel|ejszaka/gi, 'night'],
  [/nappal/gi, 'daytime'],
  [/hajnal/gi, 'dawn'],
  [/alkonyat/gi, 'dusk'],
  [/es[oő]/gi, 'rain'],
  [/k[oö]d/gi, 'fog'],
  [/hideg\s*f[eé]ny/gi, 'cold lighting'],
  [/meleg\s*f[eé]ny/gi, 'warm lighting'],
  [/sz[uű]k\s*t[eé]r/gi, 'tight spatial layout'],
  [/t[aá]gas\s*t[eé]r/gi, 'spacious layout'],
  [/koszos|piszkos/gi, 'grimy'],
  [/kopott/gi, 'worn surfaces'],
  [/neon/gi, 'neon accents'],
  [/f[aá]sult/gi, 'fatigued mood'],
];

export function mapMood(input?: string): string {
  const value = String(input || '').trim();
  if (!value) return '';
  const key = value.toLowerCase();
  return MOOD_MAP[key] || value;
}

export function normalizeToPromptEnglish(input: string): string {
  const text = String(input || '').trim();
  if (!text) return '';
  let normalized = text;
  for (const [pattern, replacement] of HU_TO_EN_GLOSSARY) normalized = normalized.replace(pattern, replacement);
  return normalized;
}

export function normalizeLocation(location: string): string {
  const normalized = normalizeToPromptEnglish(location);
  if (!normalized) return 'grounded cinematic location, detailed environment, realistic context';
  return `${normalized}, detailed environment, realistic context`;
}

function getLocationPresetPrompt(key: string): string {
  return getPreset('location', key)?.prompt || key;
}

export function buildLocationProfileSummary(scene: SceneInput): string {
  const profile = scene.scenePackage?.locationProfile;
  if (!profile) return normalizeLocation(scene.location);

  const lines: string[] = [];
  if (profile.preset) lines.push(`Preset baseline: ${getLocationPresetPrompt(profile.preset)}`);
  lines.push(
    `Specific detail: ${normalizeToPromptEnglish(profile.detail) || 'not provided'}`,
    `Geometry map: ${normalizeToPromptEnglish(profile.geometry) || 'not provided'}`,
    `Palette and textures: ${normalizeToPromptEnglish(profile.paletteAndTexture) || 'not provided'}`,
    `Fixed props: ${normalizeToPromptEnglish(profile.fixedProps) || 'not provided'}`,
    `Camera continuity: ${normalizeToPromptEnglish(profile.cameraContinuity) || 'not provided'}`
  );
  if (!scene.lighting && profile.lightingAndTime) {
    lines.push(`Legacy lighting and time: ${normalizeToPromptEnglish(profile.lightingAndTime)}`);
  }
  return lines.join('\n');
}

export function buildContinuityBlock(scene: SceneInput): string {
  const continuity = scene.scenePackage?.continuity;
  if (!continuity) return '[LOCATION CONTINUITY LOCK]\n- preserve overall location identity and environmental realism between shots';

  const locks: string[] = [];
  if (continuity.lockGeometry) locks.push('lock spatial geometry and layout consistency');
  if (continuity.lockLighting) locks.push('lock lighting direction, intensity, and time-of-day cues');
  if (continuity.lockPalette) locks.push('lock dominant palette and material texture continuity');
  if (continuity.lockProps) locks.push('lock fixed props and keep their relative placement stable');
  if (continuity.lockCameraRules) locks.push('lock camera continuity rules (axis logic, lens feel, framing grammar)');
  if (continuity.notes?.trim()) locks.push(`continuity notes: ${normalizeToPromptEnglish(continuity.notes)}`);
  if (locks.length === 0) locks.push('preserve location continuity from prior shot package');

  return `\n[LOCATION CONTINUITY LOCK]\n${locks.map((line) => `- ${line}`).join('\n')}\n`;
}

export function buildShotTemplateBlock(scene: SceneInput): string {
  const shotTemplate = scene.scenePackage?.shotTemplate;
  if (!shotTemplate) return '[SHOT TEMPLATE]\nDefault cinematic framing behavior; keep continuity with prior scene context.';
  const detail = SHOT_TEMPLATE_MAP[shotTemplate] || shotTemplate;
  return `\n[SHOT TEMPLATE]\n${detail}\n`;
}

function buildFramingBlock(scene: SceneInput): string {
  if (scene.aspectRatio === 'portrait-9-16') {
    const composition = scene.backgroundOnly
      ? 'Composition: architectural and environmental detail spans the height of the frame with layered depth; no person or character is needed'
      : 'Composition: characters and action must span the height of the frame with readable depth layers';
    return `
[FRAMING]
Orientation: portrait (vertical), cinematic 9:16
Rule: fill the entire frame vertically, no landscape composition, no black bars, no letterboxing, no centered tiny subject
${composition}
`;
  }
  const composition = scene.backgroundOnly
    ? 'Composition: architecture, objects, and environmental detail span the width of the frame with layered depth; no person or character is needed'
    : 'Composition: characters and action must span the width of the frame';
  return `
[FRAMING]
Orientation: landscape (horizontal), cinematic widescreen 16:9
Rule: fill the entire frame horizontally, no portrait composition, no black bars, no letterboxing, no centered vertical subject
${composition}
`;
}

function buildBackgroundReferenceBlock(scene: SceneInput): string {
  if (!scene.backgroundReference) return '';
  return `
[BACKGROUND REFERENCE]
- Treat the supplied background reference image as an environmental and compositional guide, never as a literal background plate.
- Preserve the reference environment's major recognizable properties when compatible: overall spatial organization, architecture or furniture, depth layers, dominant materials, important environmental landmarks, lighting logic, and broad palette relationships.
- Reconstruct and reinterpret the environment around the current character(s), action, camera, aspect ratio, and visual style.
- Adapt perspective, crop, scale, depth of field, shadows, reflections, and object placement to make the scene physically coherent.
- Do not paste, clone, trace, or reproduce the reference image pixel-for-pixel.
- Do not force the original framing or perspective when it conflicts with the selected camera or character composition.
- If people or characters appear in the reference, ignore their identity and use them only as incidental environmental context unless the explicit scene request says otherwise.
- The current character identity, explicit scene instructions, and selected camera remain the primary source of truth.
`;
}

export function buildSceneBlock(scene: SceneInput): string {
  const cast = scene.castAliases && scene.castAliases.length > 1 ? scene.castAliases.join(', ') : null;
  const actionLine = scene.actionPrompt ? `Action prompt: ${scene.actionPrompt}` : 'Action prompt: not provided';
  const lightingText = scene.lighting || scene.scenePackage?.locationProfile?.lightingAndTime || '';
  const lightingLine = lightingText ? `Lighting: ${normalizeToPromptEnglish(lightingText)}` : 'Lighting: not provided';
  return `\n[SCENE]\nLocation:\n${buildLocationProfileSummary(scene)}\n${lightingLine}\n${actionLine}\n${buildBackgroundReferenceBlock(scene)}\n\n${buildFramingBlock(scene)}\n\n${buildShotTemplateBlock(scene)}\n\n${buildContinuityBlock(scene)}\n\n[INTERACTION]\n${scene.backgroundOnly ? 'Environment-only image: absolutely no people, characters, human silhouettes, faces, or body parts; the location itself is the subject' : cast ? `Characters ${cast} are naturally integrated into the scene, with believable spacing and body language` : 'Character is naturally integrated into the scene, not posing artificially'}\n`;
}

export { MOOD_MAP };
