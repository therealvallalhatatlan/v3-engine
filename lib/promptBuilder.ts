import { CharacterDNA, SceneInput } from '../types/prompt';
import { Character } from '../types';
import { buildSceneBlock } from './sceneMapper';
import { getCamera } from './camera';
import { getStyleBlock, getNegativeBlock } from './style';

function extractAnchorPhrases(description: string): string[] {
  return description
    .split(/[,.;\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function buildAliasFromName(name: string, fallbackIndex: number): string {
  const initials = (name || '')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join('');
  if (initials) return initials;
  return `C${fallbackIndex + 1}`;
}

export function buildCharacterDNAFromCharacter(
  character: Character,
  alias?: string,
  aliasFallbackIndex = 0
): CharacterDNA {
  const traits = Array.from(
    new Set(
      (character.traits || [])
        .map((trait) => trait.trim())
        .filter(Boolean)
    )
  );
  const anchors = [
    ...extractAnchorPhrases(character.description),
    ...traits.map((trait) => `Trait: ${trait}`),
    ...(character.imagePaths?.length
      ? [`Uploaded reference images: ${character.imagePaths.length}`]
      : []),
  ];

  return {
    sourceCharacterId: character.id,
    alias: (alias || '').trim() || buildAliasFromName(character.name, aliasFallbackIndex),
    identity: {
      name: character.name,
      archetype: character.description || 'Unknown archetype',
    },
    physical: {
      face: character.description,
      body: 'Preserve the exact body shape and silhouette suggested by the reference images',
      posture: 'Keep the same overall stance and attitude as the reference set',
    },
    outfit: {
      top: `Preserve the exact signature upper-body outfit, costume pieces, and mask details described in identity text: ${character.description}`,
      bottom: `Preserve the exact lower-body costume structure and proportions described in identity text: ${character.description}`,
      accessories: traits,
    },
    anchors,
    texture: {
      material: 'Match the visual materials and surface treatment from the reference images',
      wear: 'Preserve wear, damage, and lived-in texture cues',
      dirt: 'Preserve dirt, grime, and patina as shown in the references',
    },
    energy: `Character energy derived from: ${traits.join(', ') || character.description}`,
    environmentAffinity: traits,
  };
}

export function buildIdentityBlock(character: CharacterDNA): string {
  return `
[IDENTITY]
Name: ${character.identity.name}
Archetype: ${character.identity.archetype}
`;
}

export function buildAnchorBlock(anchors: string[]): string {
  return `
[ANCHORS - DO NOT CHANGE]
${anchors.map(a => `- ${a}`).join('\n')}
`;
}

export function buildPhysicalBlock(character: CharacterDNA): string {
  return `
[PHYSICAL]
Face: ${character.physical.face}
Body: ${character.physical.body}
Posture: ${character.physical.posture}
Skin and phenotype: preserve the exact skin tone, undertone, ethnic facial features, and gender presentation defined by identity text and reference images; no phenotype drift
`;
}

export function buildOutfitBlock(character: CharacterDNA): string {
  return `
[OUTFIT]
Top: ${character.outfit.top}
Bottom: ${character.outfit.bottom}
Accessories: ${character.outfit.accessories.join(', ')}
`;
}

export function buildTextureBlock(character: CharacterDNA): string {
  return `
[TEXTURE]
Material: ${character.texture.material}
Wear: ${character.texture.wear}
Dirt: ${character.texture.dirt}
`;
}

export function buildEnergyBlock(character: CharacterDNA): string {
  return `
[ENERGY]
${character.energy}
`;
}

export function buildConstraintBlock(isMultiCharacter = false): string {
  return `
[STRICT CONSTRAINTS]
- reference images are the primary source of truth
- do not redesign the character
- do not change face structure
- preserve canonical demographics from identity/archetype text and references (skin tone, ethnicity, gender expression, age cues)
- if identity text explicitly states ethnicity or skin tone, enforce it exactly
- do not lighten or darken skin tone beyond what references and identity description define
- do not change mask shape
- do not change clothing type
- preserve proportions and silhouette
- preserve unique features, color blocking, and accessories
${isMultiCharacter
  ? '- all listed characters must appear in the same frame; none may be omitted'
  : '- same character, different scene only'}
`;
}

export function buildCastBlock(characters: CharacterDNA[]): string {
  return `
[CAST]
${characters.map((character) => `- ${character.alias}: ${character.identity.name}`).join('\n')}
`;
}

export function buildMultiCharacterCompositionBlock(scene: SceneInput, characters: CharacterDNA[]): string {
  const aliases = characters.map((character) => character.alias).join(', ');

  if (scene.aspectRatio === 'landscape-16-9') {
    return `
[MULTI-CHARACTER COMPOSITION - LANDSCAPE 16:9]
- This is a deliberate two-character widescreen composition for ${aliases}.
- Establish the composition around the complete bodies and faces of all listed characters before adding environmental detail.
- Use a medium-wide or wide two-shot with enough camera distance to contain every character comfortably.
- Both characters must have generous headroom; the top of every head, hair, or mask must remain fully inside the frame.
- Keep both faces clearly visible and inside the central safe area, away from the image edges.
- Keep both bodies readable and avoid cropping heads, shoulders, hands, feet, or distinctive costume elements unless the action explicitly requires it.
- Prefer horizontal spatial separation, natural side-by-side or staggered blocking, rather than stacking subjects into a narrow vertical column.
- If the scene feels crowded, move the camera farther back instead of cropping a character.
- Environment fills the remaining horizontal space; do not sacrifice character readability to make the location more dramatic.
- No character may touch the top, left, right, or bottom boundary of the image.
- The final frame must read immediately as one coherent photograph containing exactly ${characters.length} distinct people.
`;
  }

  return `
[MULTI-CHARACTER COMPOSITION - PORTRAIT 9:16]
- Compose ${aliases} as a coherent vertical multi-character scene.
- Preserve full head and face visibility for every character.
- Maintain clear vertical spacing and readable body language.
- Keep the composition balanced without forcing either character against the image boundary.
`;
}

export function buildMultiCharacterConstraintBlock(characters: CharacterDNA[]): string {
  return `
[MULTI-CHARACTER CONSTRAINTS]
- render exactly ${characters.length} distinct characters in one shared frame
- every listed alias must be visible: ${characters.map((c) => c.alias).join(', ')}
- maintain each listed character as a separate, identifiable person
- do not merge character identities, faces, outfits, or silhouettes
- preserve role readability for each alias: ${characters.map((c) => c.alias).join(', ')}
- interaction can change pose, but identity and core design must remain locked
`;
}

export function buildCharacterMustIncludeBlock(character: CharacterDNA): string {
  const mustKeep = [
    ...(character.outfit.accessories || []).slice(0, 6),
    ...character.anchors.filter((anchor) => !anchor.startsWith('Uploaded reference images:')).slice(0, 4),
  ];

  const unique = Array.from(new Set(mustKeep.map((item) => item.trim()).filter(Boolean)));
  if (unique.length === 0) {
    return `[MUST INCLUDE ${character.alias}]\n- preserve signature visual identity from references`;
  }

  return `
[MUST INCLUDE ${character.alias}]
${unique.map((item) => `- ${item}`).join('\n')}
`;
}

export function buildStateModifier(state: 'normal' | 'high' | 'crash'): string {
  switch (state) {
    case 'high':
      return '[STATE]\nEnergy: heightened, visual intensity increased, colors more saturated, slight glow';
    case 'crash':
      return '[STATE]\nEnergy: depleted, visuals desaturated, posture slumped, environment bleak';
    default:
      return '[STATE]\nEnergy: baseline, visuals neutral';
  }
}

export function buildScenePackageMetaBlock(scene: SceneInput): string {
  const profileId = scene.locationProfileId || scene.scenePackage?.locationProfileId;
  const fingerprint = scene.locationFingerprint;
  if (!profileId && !fingerprint) return '';

  const lines: string[] = [];
  if (profileId) lines.push(`- locationProfileId: ${profileId}`);
  if (fingerprint) lines.push(`- locationFingerprint: ${fingerprint}`);

  return `
[SCENE PACKAGE META]
${lines.join('\n')}
`;
}

export function buildFinalPrompt(
  character: CharacterDNA,
  scene: SceneInput
): string {
  const blocks = [
    buildIdentityBlock(character),
    buildAnchorBlock(character.anchors),
    buildPhysicalBlock(character),
    buildOutfitBlock(character),
    buildTextureBlock(character),
    buildEnergyBlock(character),
    buildSceneBlock(scene),
    buildScenePackageMetaBlock(scene),
    getCamera(scene.camera),
    getStyleBlock(scene.style, scene.styleIntensity),
    buildConstraintBlock(),
    getNegativeBlock(scene.style, scene.styleIntensity),
  ].filter(Boolean);
  return blocks.join('\n\n');
}

export function buildFinalPromptMulti(
  characters: CharacterDNA[],
  scene: SceneInput
): string {
  const blocks: string[] = [
    buildCastBlock(characters),
    `[MULTI SUBJECT GOAL]\nRender all listed characters together in the same moment and environment. Do not drop or replace any alias.`,
    buildMultiCharacterCompositionBlock(scene, characters),
  ];

  for (const character of characters) {
    blocks.push(`[CHARACTER ${character.alias}]`);
    blocks.push(buildIdentityBlock(character));
    blocks.push(buildAnchorBlock(character.anchors));
    blocks.push(buildPhysicalBlock(character));
    blocks.push(buildOutfitBlock(character));
    blocks.push(buildTextureBlock(character));
    blocks.push(buildEnergyBlock(character));
    blocks.push(buildCharacterMustIncludeBlock(character));
  }

  blocks.push(buildSceneBlock(scene));
  blocks.push(buildScenePackageMetaBlock(scene));
  blocks.push(getCamera(scene.camera));
  blocks.push(getStyleBlock(scene.style, scene.styleIntensity));
  blocks.push(buildConstraintBlock(true));
  blocks.push(buildMultiCharacterConstraintBlock(characters));
  blocks.push(getNegativeBlock(scene.style, scene.styleIntensity));

  return blocks.join('\n\n');
}


/**
 * Build a location-first prompt without creating or implying a character identity.
 * Reference images are interpreted as environmental/layout/material references by
 * the interaction layer, not as character identity references.
 */
/**
 * Build a location-first prompt without creating or implying a character identity.
 * Environment references are treated as composition, materials, architecture and lighting guidance.
 */
export function buildBackgroundOnlyPrompt(scene: SceneInput): string {
  const backgroundScene: SceneInput = { ...scene, backgroundOnly: true, castAliases: [] };
  const description = backgroundScene.actionPrompt?.trim()
    ? `\n[ENVIRONMENT BRIEF]\n${backgroundScene.actionPrompt.trim()}\n`
    : '';
  return [
    `[BACKGROUND / ENVIRONMENT GENERATION]
Generate a standalone environment plate for a visual production workflow. The location itself is the subject.
- Do not generate any people, characters, faces, human silhouettes, mannequins, body parts, or implied foreground figures.
- Prioritize believable architecture, spatial layout, objects, surface materials, atmospheric depth, and coherent lighting.
- Keep the scene composition usable as a background plate that can later receive a character.
- Treat any supplied reference images as environmental/compositional/material guidance, not as identity or character references.
- Reconstruct the environment coherently; do not simply collage the supplied references.
`,
    description,
    buildSceneBlock(backgroundScene),
    getCamera(backgroundScene.camera),
    getStyleBlock(backgroundScene.style, backgroundScene.styleIntensity),
    getNegativeBlock(backgroundScene.style, backgroundScene.styleIntensity),
  ].filter(Boolean).join('\\n\\n');
}
