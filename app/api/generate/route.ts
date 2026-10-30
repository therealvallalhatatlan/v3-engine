import { NextRequest, NextResponse } from 'next/server';
import { generateImageInteraction } from '../../../lib/geminiInteractions';
import { buildFinalPrompt, buildFinalPromptMulti, buildBackgroundOnlyPrompt } from '../../../lib/promptBuilder';
import { buildCharacterDNAFromCharacter } from '../../../lib/promptBuilder';
import { AspectRatio16x9, LocationPreset, SceneInput, ScenePackageInput, ShotTemplate } from '../../../types/prompt';
import { normalizeToPromptEnglish } from '../../../lib/sceneMapper';
import { getPreset } from '../../../lib/presetStore';
import { loadPresetCatalogFromSupabase } from '../../../lib/supabase/presets';
import { createSupabaseServerClient, getCurrentUser } from '../../../lib/supabase/server';
import { getAppCharacterById } from '../../../lib/supabase/characters';
import { saveGeneratedImageToSupabase, shouldAddWatermark } from '../../../lib/supabase/generation';
import { createSignedMediaUrl, downloadAsDataUrl } from '../../../lib/supabase/media';
import { v4 as uuidv4 } from 'uuid';

function clampIntensity(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 65;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function selectBalancedReferenceImages(characters: Array<{ imagePaths?: string[] }>, maxTotal = 6, maxPerCharacter = 3): string[] {
  const buckets = characters.map((character) => (character.imagePaths || []).slice(0, maxPerCharacter));
  const selected: string[] = [];
  let round = 0;
  while (selected.length < maxTotal) {
    let addedInRound = 0;
    for (const bucket of buckets) {
      if (selected.length >= maxTotal) break;
      if (bucket.length > round) { selected.push(bucket[round]); addedInRound += 1; }
    }
    if (addedInRound === 0) break;
    round += 1;
  }
  return selected;
}

const ALLOWED_SHOT_TEMPLATES: ShotTemplate[] = ['establishing-wide', 'medium-dialogue', 'closeup-emotion', 'over-shoulder', 'insert-detail', 'tracking-motion'];
const ALLOWED_ASPECT_RATIOS: AspectRatio16x9[] = ['landscape-16-9', 'portrait-9-16'];

function normalizeText(value: unknown, max = 600): string {
  const text = String(value || '').trim();
  return text ? text.slice(0, max) : '';
}

function safeSlug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

function simpleHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

function normalizeScenePackage(raw: any): ScenePackageInput | undefined {
  if (!raw || typeof raw !== 'object' || !raw.locationProfile || typeof raw.locationProfile !== 'object') return undefined;
  const presetRaw = String(raw.locationProfile.preset || '').trim() as LocationPreset;
  const shotTemplateRaw = String(raw.shotTemplate || 'establishing-wide').trim() as ShotTemplate;
  if (!getPreset('location', presetRaw)) return undefined;
  const locationProfile = {
    preset: presetRaw,
    detail: normalizeText(raw.locationProfile.detail, 600),
    geometry: normalizeText(raw.locationProfile.geometry, 600),
    lightingAndTime: normalizeText(raw.locationProfile.lightingAndTime, 400),
    paletteAndTexture: normalizeText(raw.locationProfile.paletteAndTexture, 400),
    fixedProps: normalizeText(raw.locationProfile.fixedProps, 500),
    cameraContinuity: normalizeText(raw.locationProfile.cameraContinuity, 400),
  };
  const continuity = {
    lockGeometry: Boolean(raw.continuity?.lockGeometry),
    lockLighting: Boolean(raw.continuity?.lockLighting),
    lockPalette: Boolean(raw.continuity?.lockPalette),
    lockProps: Boolean(raw.continuity?.lockProps),
    lockCameraRules: Boolean(raw.continuity?.lockCameraRules),
    notes: normalizeText(raw.continuity?.notes, 400) || undefined,
  };
  const sourceLanguage = String(raw.bilingualInput?.sourceLanguage || 'mixed').toLowerCase();
  const normalizedSourceLanguage = sourceLanguage === 'hu' || sourceLanguage === 'en' || sourceLanguage === 'mixed' ? sourceLanguage : 'mixed';
  const profileIdCandidate = normalizeText(raw.locationProfileId, 120);
  const profileId = profileIdCandidate || [safeSlug(presetRaw), safeSlug(locationProfile.detail || locationProfile.geometry || 'location')].filter(Boolean).join('--').slice(0, 120);
  return { locationProfileId: profileId || undefined, locationProfile, continuity, shotTemplate: shotTemplateRaw, bilingualInput: { sourceLanguage: normalizedSourceLanguage as 'hu' | 'en' | 'mixed' } };
}

function resolveLocationText(location: unknown, scenePackage?: ScenePackageInput): string {
  const legacyLocation = normalizeText(location, 800);
  if (scenePackage?.locationProfile?.detail) return scenePackage.locationProfile.detail;
  if (legacyLocation) return legacyLocation;
  const preset = String(scenePackage?.locationProfile?.preset || '');
  return getPreset('location', preset)?.prompt || 'cinematic scene location';
}

export async function POST(req: NextRequest) {
  let reservedCredits = 0;
  let consumedCredits = 0;
  let currentUserId = '';
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    currentUserId = user.id;

    const data = await req.json();
    const { characterId, characterIds, aliasMap, location, lighting, mood, actionPrompt, camera, aspectRatio, style, styleIntensity, compareStyle, textOnly, scenePackage, backgroundReferencePath } = data;
    const backgroundOnly = data?.generationMode === 'background' || data?.backgroundOnly === true;
    const lightingText = normalizeText(typeof lighting === 'string' ? lighting : mood, 500);
    const requestedBackgroundReferencePath = String(backgroundReferencePath || '').trim();
    let backgroundReferenceDataUrl = '';
    if (requestedBackgroundReferencePath) {
      const expectedPrefix = currentUserId + '/background-references/';
      if (!requestedBackgroundReferencePath.startsWith(expectedPrefix)) {
        return NextResponse.json({ error: 'Invalid background reference path' }, { status: 403 });
      }
      backgroundReferenceDataUrl = await downloadAsDataUrl(requestedBackgroundReferencePath);
    }
    const normalizedCharacterIds = backgroundOnly
      ? []
      : Array.from(new Set([...(Array.isArray(characterIds) ? characterIds : []), characterId].map((id) => String(id || '').trim()).filter(Boolean)));
    if (!backgroundOnly && normalizedCharacterIds.length === 0) {
      return NextResponse.json({ error: 'characterId or characterIds is required unless generationMode is background' }, { status: 400 });
    }
    const rawEnvironmentPaths = backgroundOnly && Array.isArray(data?.backgroundReferencePaths)
      ? data.backgroundReferencePaths.map((value: unknown) => String(value || '').trim()).filter(Boolean)
      : [];
    const rawEnvironmentIds = Array.isArray(data?.backgroundReferenceGenerationIds)
      ? Array.from(new Set(data.backgroundReferenceGenerationIds.map((value: unknown) => String(value || '').trim()).filter(Boolean)))
      : [];
    if (rawEnvironmentPaths.length + rawEnvironmentIds.length > 6) {
      return NextResponse.json({ error: 'Legfeljebb 6 környezeti referenciakép használható egyszerre.' }, { status: 400 });
    }
    const expectedReferencePrefix = currentUserId + '/background-references/';
    if (rawEnvironmentPaths.some((path: string) => !path.startsWith(expectedReferencePrefix))) {
      return NextResponse.json({ error: 'Invalid environment reference path' }, { status: 403 });
    }
    const environmentReferenceDataUrls = await Promise.all(rawEnvironmentPaths.map((path: string) => downloadAsDataUrl(path)));
    const loadedCharacters = await Promise.all(normalizedCharacterIds.map((id) => getAppCharacterById(id, true)));
    const missingIds = normalizedCharacterIds.filter((id, index) => !loadedCharacters[index]);
    if (missingIds.length > 0) return NextResponse.json({ error: `Character not found: ${missingIds.join(', ')}` }, { status: 404 });
    const charactersForGeneration = loadedCharacters.map((character) => textOnly ? { ...character!, imagePaths: [] } : character!);

    const supabase = await createSupabaseServerClient();
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan, generation_credits')
      .eq('id', currentUserId)
      .maybeSingle();
    if (profileError) return NextResponse.json({ error: 'Unable to load user profile' }, { status: 500 });
    if (!profile) return NextResponse.json({ error: 'User profile not initialized' }, { status: 403 });

    try {
      await loadPresetCatalogFromSupabase(supabase, { seedIfNeeded: profile.plan === 'admin' });
    } catch (presetError: any) {
      console.error('Preset catalog unavailable:', presetError);
      return NextResponse.json({ error: 'A presetkatalógus nem érhető el. Próbáld újra később.' }, { status: 503 });
    }

    let cameraKey = String(camera || 'wide');
    if (cameraKey === 'close-up') cameraKey = 'closeup';
    if (!getPreset('camera', cameraKey)) cameraKey = 'wide';

    const requestedStyle = String(style || '').trim();
    const styleKey = getPreset('style', requestedStyle) ? requestedStyle : 'gritty';
    const requestedCompareStyle = String(compareStyle || '').trim();
    const requestedCompareStyleKey = getPreset('style', requestedCompareStyle) ? requestedCompareStyle : null;
    const aspectRatioKey = ALLOWED_ASPECT_RATIOS.includes(aspectRatio as AspectRatio16x9) ? aspectRatio as AspectRatio16x9 : 'landscape-16-9';

    const isPaid = profile.plan === 'paid' || profile.plan === 'admin';
    let libraryEnvironmentReferenceDataUrls: string[] = [];
    if (rawEnvironmentIds.length > 0) {
      const { data: backgroundRows, error: backgroundRowsError } = await supabase
        .from('generated_images')
        .select('id, storage_path')
        .eq('owner_id', currentUserId)
        .eq('generation_type', 'background')
        .in('id', rawEnvironmentIds);
      if (backgroundRowsError) {
        console.error('Environment reference lookup error:', backgroundRowsError);
        return NextResponse.json({ error: 'Unable to load selected background references. Apply the background generation migration first.' }, { status: 500 });
      }
      if (!backgroundRows || backgroundRows.length !== rawEnvironmentIds.length) {
        return NextResponse.json({ error: 'One or more selected background references were not found.' }, { status: 404 });
      }
      libraryEnvironmentReferenceDataUrls = await Promise.all(backgroundRows.map((row) => downloadAsDataUrl(row.storage_path)));
    }
    const backgroundReferenceImages = [...environmentReferenceDataUrls, ...libraryEnvironmentReferenceDataUrls].map((dataUrl) => {
      const match = String(dataUrl).match(/^data:(image\/[^;]+);base64,(.+)$/);
      return { mimeType: match?.[1] || 'image/jpeg', data: match?.[2] || '' };
    });
    const compareStyleKey = isPaid ? requestedCompareStyleKey : null;
    const intensity = isPaid ? clampIntensity(styleIntensity) : 65;
    const requestedShotTemplate = String(scenePackage?.shotTemplate || 'establishing-wide').trim() as ShotTemplate;
    const freeScenePackage = {
      locationProfile: {
        preset: String(scenePackage?.locationProfile?.preset || 'urban-street').trim(),
        detail: normalizeText(location, 800),
        geometry: '',
        lightingAndTime: lightingText,
        paletteAndTexture: '',
        fixedProps: '',
        cameraContinuity: '',
      },
      continuity: {
        lockGeometry: true,
        lockLighting: true,
        lockPalette: true,
        lockProps: true,
        lockCameraRules: true,
      },
      shotTemplate: ALLOWED_SHOT_TEMPLATES.includes(requestedShotTemplate) ? requestedShotTemplate : 'establishing-wide',
      bilingualInput: { sourceLanguage: 'mixed' as const },
    };
    const normalizedScenePackage = normalizeScenePackage(isPaid ? scenePackage : freeScenePackage);
    if (normalizedScenePackage && lightingText) {
      normalizedScenePackage.locationProfile.lightingAndTime = lightingText;
    }
    const cameraKeyForUser = cameraKey;
    const resolvedLocation = resolveLocationText(location, normalizedScenePackage);

    const castAliases = charactersForGeneration.map((character, index) => {
      const explicit = aliasMap && typeof aliasMap === 'object' ? String(aliasMap[character.id] || '').trim() : '';
      if (explicit) return explicit;
      return buildCharacterDNAFromCharacter(character, undefined, index).alias || `C${index + 1}`;
    });

    const scene: SceneInput = {
      location: resolvedLocation,
      lighting: normalizeToPromptEnglish(lightingText),
      mood: undefined,
      actionPrompt: typeof actionPrompt === 'string' ? actionPrompt.trim() : undefined,
      castAliases,
      scenePackage: normalizedScenePackage,
      locationProfileId: normalizedScenePackage?.locationProfileId,
      aspectRatio: aspectRatioKey,
      style: styleKey,
      styleIntensity: intensity,
      camera: cameraKeyForUser,
      backgroundReference: Boolean(backgroundReferenceDataUrl || backgroundReferenceImages.length),
      backgroundOnly,
    };

    const locationFingerprintSource = normalizedScenePackage
      ? JSON.stringify({ profile: normalizedScenePackage.locationProfile, continuity: normalizedScenePackage.continuity })
      : resolvedLocation;
    const locationFingerprint = `loc-${simpleHash(locationFingerprintSource)}`;
    scene.locationFingerprint = locationFingerprint;

    const characterDNAList = charactersForGeneration.map((character, index) => {
      const explicitAlias = aliasMap && typeof aliasMap === 'object' ? String(aliasMap[character.id] || '').trim() : '';
      return buildCharacterDNAFromCharacter(character, explicitAlias, index);
    });
    const isMultiCharacter = characterDNAList.length > 1;
    const isCompare = Boolean(compareStyleKey);
    const creditCost = isCompare ? 2 : 1;

    if ((profile.generation_credits ?? 0) < creditCost) {
      return NextResponse.json({ error: 'Not enough credits', requiredCredits: creditCost, availableCredits: profile.generation_credits ?? 0 }, { status: 402 });
    }

    const { data: reserved, error: reserveError } = await supabase.rpc('reserve_generation_credits', {
      p_user_id: currentUserId,
      p_cost: creditCost,
    });

    if (reserveError) {
      console.error('Credit reservation error:', reserveError);
      return NextResponse.json({ error: 'Unable to reserve generation credits' }, { status: 500 });
    }

    if (!reserved) {
      return NextResponse.json({ error: 'Not enough credits', requiredCredits: creditCost }, { status: 402 });
    }

    reservedCredits = creditCost;
    const prompt = backgroundOnly ? buildBackgroundOnlyPrompt(scene) : isMultiCharacter ? buildFinalPromptMulti(characterDNAList, scene) : buildFinalPrompt(characterDNAList[0], scene);
    const referenceImages = selectBalancedReferenceImages(charactersForGeneration);
    const generationIdA = uuidv4();
    const generationIdB = compareStyleKey ? uuidv4() : null;

    const saveGeneratedRecord = async (
      imageBase64: string,
      generationId: string,
      recordStyle: string,
      recordVariant: 'single' | 'A' | 'B',
      recordPrompt: string,
      interactionId?: string,
    ) => {
      const storagePath = await saveGeneratedImageToSupabase(imageBase64, currentUserId, generationId, aspectRatioKey, shouldAddWatermark(profile.plan));
      const { error: insertError } = await supabase.from('generated_images').insert({
        id: generationId,
        owner_id: currentUserId,
        character_id: normalizedCharacterIds[0] || null,
        character_ids: normalizedCharacterIds,
        generation_type: backgroundOnly ? 'background' : 'character',
        storage_path: storagePath,
        prompt: recordPrompt,
        style: recordStyle,
        camera: cameraKeyForUser,
        aspect_ratio: aspectRatioKey,
        variant: recordVariant,
        credit_cost: 1,
        gemini_interaction_id: interactionId || null,
      });
      if (insertError) throw new Error(`Generated image metadata save failed: ${insertError.message}`);
      const url = await createSignedMediaUrl(storagePath, 3600);
      return { storagePath, url };
    };

    const geminiAspectRatio = aspectRatioKey === 'portrait-9-16' ? '9:16' : '16:9';
    const generatedA = await generateImageInteraction({
      prompt,
      additionalImages: referenceImages.map((dataUrl) => {
        const match = String(dataUrl).match(/^data:(image\/[^;]+);base64,(.+)$/);
        return { mimeType: match?.[1] || 'image/png', data: match?.[2] || '' };
      }),
      aspectRatio: geminiAspectRatio,
      imageSize: '1K',
      backgroundReferenceImage: backgroundReferenceDataUrl
        ? (() => {
            const match = String(backgroundReferenceDataUrl).match(/^data:(image\/[^;]+);base64,(.+)$/);
            return {
              mimeType: match?.[1] || 'image/jpeg',
              data: match?.[2] || '',
            };
          })()
        : undefined,
      backgroundReferenceImages,
    });
    if (!generatedA.imageBase64) throw new Error('Gemini returned no image data');
    const savedA = await saveGeneratedRecord(
      generatedA.imageBase64,
      generationIdA,
      styleKey,
      compareStyleKey ? 'A' : 'single',
      prompt,
      generatedA.interactionId,
    );
    consumedCredits = 1;
    const imagePath = savedA.url;

    if (compareStyleKey) {
      const compareScene: SceneInput = { ...scene, style: compareStyleKey };
      const comparePrompt = backgroundOnly ? buildBackgroundOnlyPrompt(compareScene) : isMultiCharacter ? buildFinalPromptMulti(characterDNAList, compareScene) : buildFinalPrompt(characterDNAList[0], compareScene);
      const generatedB = await generateImageInteraction({
        prompt: comparePrompt,
        additionalImages: referenceImages.map((dataUrl) => {
          const match = String(dataUrl).match(/^data:(image\/[^;]+);base64,(.+)$/);
          return { mimeType: match?.[1] || 'image/png', data: match?.[2] || '' };
        }),
        aspectRatio: geminiAspectRatio,
        imageSize: '1K',
        backgroundReferenceImage: backgroundReferenceDataUrl
          ? (() => {
              const match = String(backgroundReferenceDataUrl).match(/^data:(image\/[^;]+);base64,(.+)$/);
              return {
                mimeType: match?.[1] || 'image/jpeg',
                data: match?.[2] || '',
              };
            })()
          : undefined,
        backgroundReferenceImages,
      });
      let imagePathB = null;
      if (!generatedB.imageBase64 || !generationIdB) throw new Error('Gemini returned no comparison image data');
      const savedB = await saveGeneratedRecord(
        generatedB.imageBase64,
        generationIdB,
        compareStyleKey,
        'B',
        comparePrompt,
        generatedB.interactionId,
      );
      consumedCredits = 2;
      imagePathB = savedB.url;
      await supabase.from('generation_events').insert({
        user_id: currentUserId,
        status: 'success',
        provider: 'gemini',
        credits: reservedCredits,
        metadata: { characterIds: normalizedCharacterIds, generationType: backgroundOnly ? 'background' : 'character', compare: true, generationIdA, generationIdB },
      });
      return NextResponse.json({ ok: true, imagePath, imagePathB, image: imagePath, compareImage: imagePathB, generationId: generationIdA, compareGenerationId: generationIdB, prompt, comparePrompt, characterIds: normalizedCharacterIds, aspectRatio: aspectRatioKey, style: styleKey, compareStyle: compareStyleKey, locationProfileId: normalizedScenePackage?.locationProfileId, locationFingerprint, creditCost: reservedCredits });
    }

    const { error: eventError } = await supabase.from('generation_events').insert({
      user_id: currentUserId,
      status: 'success',
      provider: 'gemini',
      credits: reservedCredits,
      metadata: { characterIds: normalizedCharacterIds, generationType: backgroundOnly ? 'background' : 'character', compare: false, generationId: generationIdA },
    });
    if (eventError) console.error('Generation event log error:', eventError);

    return NextResponse.json({ ok: true, imagePath, image: imagePath, generationId: generationIdA, prompt, characterIds: normalizedCharacterIds, aspectRatio: aspectRatioKey, style: styleKey, locationProfileId: normalizedScenePackage?.locationProfileId, locationFingerprint, creditCost: reservedCredits });
  } catch (error: any) {
    const refundableCredits = Math.max(0, reservedCredits - consumedCredits);
    if (currentUserId && refundableCredits > 0) {
      try {
        const supabase = await createSupabaseServerClient();
        await supabase.rpc('refund_generation_credits', {
          p_user_id: currentUserId,
          p_cost: refundableCredits,
          p_reference: 'generation_error',
        });
        await supabase.from('generation_events').insert({
          user_id: currentUserId,
          status: 'failed',
          provider: 'gemini',
          credits: refundableCredits,
          metadata: { error: error?.message || 'unknown error', reservedCredits, consumedCredits },
        });
      } catch (refundError) {
        console.error('Credit refund error:', refundError);
      }
    }
    console.error('Generation error:', error);
    return NextResponse.json({ error: error?.message || 'Generation failed' }, { status: 500 });
  }
}
