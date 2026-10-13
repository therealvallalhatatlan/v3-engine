import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentUser } from '../../../lib/supabase/server';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { getAppCharacterById } from '../../../lib/supabase/characters';
import { downloadAsDataUrl, createSignedMediaUrl } from '../../../lib/supabase/media';
import { saveGeneratedImageToSupabase, shouldAddWatermark } from '../../../lib/supabase/generation';
import { generateImageInteraction, GeminiImageInput } from '../../../lib/geminiInteractions';
import { buildFallbackEditPrompt, buildImageEditPrompt, IMAGE_EDIT_SYSTEM_INSTRUCTION } from '../../../lib/imageEditPrompt';

const MAX_REFERENCE_UPLOADS = 4;
const MAX_REFERENCE_DATA_URL_LENGTH = 12 * 1024 * 1024;
const MAX_CHARACTER_REFERENCES = 4;

function normalizeText(value: unknown, max = 3000): string {
  return String(value || '').trim().slice(0, max);
}

function parseDataUrl(dataUrl: string): GeminiImageInput {
  const match = String(dataUrl || '').match(/^data:(image\/[^;]+);base64,(.+)$/i);
  if (!match) throw new Error('Érvénytelen referencia kép.');
  if (match[0].length > MAX_REFERENCE_DATA_URL_LENGTH) throw new Error('A referencia kép túl nagy.');
  return { mimeType: match[1].toLowerCase(), data: match[2] };
}

function uniqueIds(values: unknown[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function characterReferenceInputs(character: { imagePaths?: string[] }, max = MAX_CHARACTER_REFERENCES): GeminiImageInput[] {
  return (character.imagePaths || []).slice(0, max).map((dataUrl) => {
    const match = String(dataUrl || '').match(/^data:(image\/[^;]+);base64,(.+)$/i);
    if (!match) return null;
    return { mimeType: match[1].toLowerCase(), data: match[2] };
  }).filter((item): item is GeminiImageInput => Boolean(item));
}

async function getOwnedGeneration(supabase: any, userId: string, generationId: string) {
  const { data, error } = await supabase
    .from('generated_images')
    .select('id, owner_id, character_id, character_ids, generation_type, storage_path, prompt, style, camera, aspect_ratio, variant, credit_cost, parent_generation_id, edit_index, edit_session_id, edit_instruction, gemini_interaction_id, created_at')
    .eq('id', generationId)
    .eq('owner_id', userId)
    .maybeSingle();

  if (error) throw new Error(`Unable to load source image: ${error.message}`);
  if (!data) throw new Error('A szerkesztendő kép nem található.');
  return data;
}

async function getSession(supabase: any, userId: string, sessionId: string) {
  const { data, error } = await supabase
    .from('image_edit_sessions')
    .select('id, owner_id, root_generation_id, current_generation_id, gemini_interaction_id, title, created_at, updated_at')
    .eq('id', sessionId)
    .eq('owner_id', userId)
    .maybeSingle();

  if (error) throw new Error(`Unable to load edit session: ${error.message}`);
  if (!data) throw new Error('Edit session not found.');
  return data;
}

async function recentUserEdits(supabase: any, userId: string, generationId: string): Promise<string[]> {
  const lineageIds: string[] = [];
  let cursor: string | null = generationId;

  for (let depth = 0; depth < 24 && cursor; depth += 1) {
    lineageIds.push(cursor);
    const generation = await getOwnedGeneration(supabase, userId, cursor);
    cursor = generation.parent_generation_id ? String(generation.parent_generation_id) : null;
  }

  const { data, error } = await supabase
    .from('image_edit_messages')
    .select('content, role, generation_id')
    .eq('owner_id', userId)
    .eq('role', 'user')
    .in('generation_id', lineageIds)
    .order('created_at', { ascending: true })
    .limit(24);

  if (error) return [];
  return (data || []).map((row: any) => String(row.content || '').trim()).filter(Boolean).slice(-8);
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const supabase = await createSupabaseServerClient();

  let sessionId = normalizeText(req.nextUrl.searchParams.get('sessionId'), 100);
  const generationId = normalizeText(req.nextUrl.searchParams.get('generationId'), 120);

  if (!sessionId && generationId) {
    const generation = await getOwnedGeneration(supabase, user.id, generationId);

    if (generation.edit_session_id) {
      sessionId = String(generation.edit_session_id);
    } else {
      const { data: rootSession, error: rootSessionError } = await supabase
        .from('image_edit_sessions')
        .select('id')
        .eq('owner_id', user.id)
        .eq('root_generation_id', generation.id)
        .maybeSingle();

      if (rootSessionError) throw new Error(`Unable to locate edit session: ${rootSessionError.message}`);
      sessionId = rootSession?.id ? String(rootSession.id) : '';
    }
  }

  if (!sessionId) return NextResponse.json({ error: 'Edit session not found' }, { status: 404 });

  try {
    const session = await getSession(supabase, user.id, sessionId);

    const { data: messages, error: messageError } = await supabase
      .from('image_edit_messages')
      .select('id, role, content, generation_id, metadata, created_at')
      .eq('session_id', session.id)
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true });

    if (messageError) throw new Error(`Unable to load edit history: ${messageError.message}`);

    const generationsResult = await supabase
      .from('generated_images')
      .select('id, owner_id, character_id, character_ids, storage_path, prompt, style, camera, aspect_ratio, variant, credit_cost, parent_generation_id, edit_session_id, edit_instruction, edit_response, edit_index, gemini_interaction_id, created_at')
      .eq('owner_id', user.id)
      .eq('edit_session_id', session.id)
      .order('edit_index', { ascending: true });

    if (generationsResult.error) {
      throw new Error(`Unable to load edit versions: ${generationsResult.error.message}`);
    }

    const versions: any[] = [];
    if (!session.root_generation_id) throw new Error('Edit session has no root generation.');

    const rootGeneration = await getOwnedGeneration(supabase, user.id, session.root_generation_id);
    versions.push({
      id: rootGeneration.id,
      url: await createSignedMediaUrl(rootGeneration.storage_path, 3600),
      version: 0,
      instruction: null,
      createdAt: rootGeneration.created_at,
    });

    for (const generation of generationsResult.data || []) {
      if (generation.id === rootGeneration.id) continue;
      versions.push({
        id: generation.id,
        url: await createSignedMediaUrl(generation.storage_path, 3600),
        version: Number(generation.edit_index || 0),
        instruction: generation.edit_instruction || null,
        createdAt: generation.created_at,
      });
    }

    versions.sort((a, b) => a.version - b.version || String(a.createdAt).localeCompare(String(b.createdAt)));

    const currentGeneration = session.current_generation_id
      ? versions.find((version) => version.id === session.current_generation_id)
      : null;

    const current = currentGeneration
      ? {
          id: currentGeneration.id,
          url: currentGeneration.url,
          version: currentGeneration.version,
        }
      : null;

    return NextResponse.json({ session, messages: messages || [], current, versions });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load edit session' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const supabase = await createSupabaseServerClient();

  let reserved = 0;
  try {
    const body = await req.json().catch(() => ({}));
    const instruction = normalizeText(body?.instruction, 2000);
    const sourceGenerationId = normalizeText(body?.sourceGenerationId, 120);
    const requestedSessionId = normalizeText(body?.sessionId, 120);
    const addedCharacterIds = uniqueIds(Array.isArray(body?.characterIds) ? body.characterIds : []);
    const rawReferences = Array.isArray(body?.referenceImages)
      ? body.referenceImages.filter((value: unknown): value is string => typeof value === 'string')
      : [];

    if (!instruction) return NextResponse.json({ error: 'Írd le, mit szeretnél módosítani a képen.' }, { status: 400 });
    if (addedCharacterIds.length > 3) {
      return NextResponse.json({ error: 'Egy szerkesztési körben legfeljebb 3 új karakter adható hozzá.' }, { status: 400 });
    }
    if (rawReferences.length > MAX_REFERENCE_UPLOADS) {
      return NextResponse.json({ error: `Legfeljebb ${MAX_REFERENCE_UPLOADS} új referencia kép adható egy körben.` }, { status: 400 });
    }

    const uploadedReferences = rawReferences.map(parseDataUrl);

    const profileResult = await supabase
      .from('profiles')
      .select('plan, generation_credits')
      .eq('id', user.id)
      .maybeSingle();

    if (profileResult.error) return NextResponse.json({ error: 'Unable to load user profile' }, { status: 500 });
    if (!profileResult.data) return NextResponse.json({ error: 'User profile not initialized' }, { status: 403 });
    if ((profileResult.data.generation_credits ?? 0) < 1) {
      return NextResponse.json({ error: 'Not enough credits', requiredCredits: 1, availableCredits: profileResult.data.generation_credits ?? 0 }, { status: 402 });
    }

    let session = requestedSessionId ? await getSession(supabase, user.id, requestedSessionId) : null;
    let currentGeneration = null;

    if (session) {
      const selectedGenerationId = sourceGenerationId || session.current_generation_id;
      if (!selectedGenerationId) throw new Error('Edit session has no current generation.');

      const selectedGeneration = await getOwnedGeneration(supabase, user.id, selectedGenerationId);
      const belongsToSession =
        selectedGeneration.id === session.root_generation_id ||
        selectedGeneration.edit_session_id === session.id;

      if (!belongsToSession) {
        return NextResponse.json({ error: 'A kiválasztott verzió nem tartozik ehhez a szerkesztési munkamenethez.' }, { status: 403 });
      }

      currentGeneration = selectedGeneration;
    }

    if (!session) {
      if (!sourceGenerationId) return NextResponse.json({ error: 'Missing sourceGenerationId' }, { status: 400 });
      currentGeneration = await getOwnedGeneration(supabase, user.id, sourceGenerationId);

      const newSessionId = uuidv4();
      const { data: createdSession, error: sessionError } = await supabase
        .from('image_edit_sessions')
        .insert({
          id: newSessionId,
          owner_id: user.id,
          root_generation_id: currentGeneration.id,
          current_generation_id: currentGeneration.id,
          gemini_interaction_id: currentGeneration.gemini_interaction_id || null,
          title: instruction.slice(0, 80),
        })
        .select('id, owner_id, root_generation_id, current_generation_id, gemini_interaction_id, title, created_at, updated_at')
        .single();

      if (sessionError) throw new Error(`Edit session creation failed: ${sessionError.message}`);
      session = createdSession;
    }

    if (!currentGeneration) throw new Error('Edit session has no current generation.');

    const currentCharacterIds = Array.isArray(currentGeneration.character_ids)
      ? currentGeneration.character_ids.map(String)
      : [String(currentGeneration.character_id || '')].filter(Boolean);
    const allCharacterIds = uniqueIds([...currentCharacterIds, ...addedCharacterIds]);

    const currentCharacters = [];
    for (const id of currentCharacterIds.slice(0, 4)) {
      const loaded = await getAppCharacterById(id, true);
      if (loaded) currentCharacters.push(loaded);
    }

    const addedCharacters = [];
    for (const id of addedCharacterIds) {
      if (currentCharacterIds.includes(id)) continue;
      const loaded = await getAppCharacterById(id, true);
      if (!loaded) return NextResponse.json({ error: 'A hozzáadni kívánt karakter nem érhető el.' }, { status: 403 });
      addedCharacters.push(loaded);
    }

    const currentImageDataUrl = await downloadAsDataUrl(currentGeneration.storage_path);
    const recentEdits = await recentUserEdits(supabase, user.id, currentGeneration.id);
    const characterNames = currentCharacters.map((item: any) => item.name);
    const addedCharacterNames = addedCharacters.map((item: any) => item.name);

    const promptInput = {
      instruction,
      characterNames,
      addedCharacterNames,
      recentEditInstructions: recentEdits,
      originalPrompt: currentGeneration.prompt || '',
    };

    const prompt = buildImageEditPrompt(promptInput);
    const fallbackPrompt = buildFallbackEditPrompt(promptInput);
    const additionalImages = [
      ...addedCharacters.flatMap((character: any) => characterReferenceInputs(character, 2)),
      ...uploadedReferences,
    ].slice(0, 8);

    const currentImageMatch = currentImageDataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/i);
    if (!currentImageMatch) throw new Error('Unable to prepare source image.');

    const currentImage = { mimeType: currentImageMatch[1].toLowerCase(), data: currentImageMatch[2] };

    const creditReservation = await supabase.rpc('reserve_generation_credits', {
      p_user_id: user.id,
      p_cost: 1,
    });

    if (creditReservation.error) throw new Error('Unable to reserve generation credits');
    if (!creditReservation.data) {
      return NextResponse.json({ error: 'Not enough credits', requiredCredits: 1 }, { status: 402 });
    }
    reserved = 1;

    let generated;
    const previousInteractionId = currentGeneration.gemini_interaction_id || null;

    try {
      generated = await generateImageInteraction({
        prompt,
        sourceImage: currentImage,
        additionalImages,
        previousInteractionId,
        aspectRatio: currentGeneration.aspect_ratio === 'portrait-9-16' ? '9:16' : '16:9',
        imageSize: '1K',
        systemInstruction: IMAGE_EDIT_SYSTEM_INSTRUCTION,
      });
    } catch (firstError: any) {
      if (!previousInteractionId) throw firstError;

      console.warn('Gemini conversation continuation failed, retrying from current image:', firstError?.message || firstError);
      generated = await generateImageInteraction({
        prompt: fallbackPrompt,
        sourceImage: currentImage,
        additionalImages,
        previousInteractionId: null,
        aspectRatio: currentGeneration.aspect_ratio === 'portrait-9-16' ? '9:16' : '16:9',
        imageSize: '1K',
        systemInstruction: IMAGE_EDIT_SYSTEM_INSTRUCTION,
      });
    }

    if (!generated.imageBase64) throw new Error('Gemini returned no edited image.');

    const generationId = uuidv4();
    const storagePath = await saveGeneratedImageToSupabase(
      generated.imageBase64,
      user.id,
      generationId,
      currentGeneration.aspect_ratio === 'portrait-9-16' ? 'portrait-9-16' : 'landscape-16-9',
      shouldAddWatermark(profileResult.data.plan),
    );

    const { data: latestVersion } = await supabase
      .from('generated_images')
      .select('edit_index')
      .eq('owner_id', user.id)
      .eq('edit_session_id', session.id)
      .order('edit_index', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = Math.max(0, Number(latestVersion?.edit_index || 0)) + 1;

    const { error: insertError } = await supabase.from('generated_images').insert({
      id: generationId,
      owner_id: user.id,
      character_id: currentGeneration.character_id,
      character_ids: allCharacterIds,
      generation_type: currentGeneration.generation_type || 'character',
      storage_path: storagePath,
      prompt,
      style: currentGeneration.style,
      camera: currentGeneration.camera,
      aspect_ratio: currentGeneration.aspect_ratio,
      variant: currentGeneration.variant || 'single',
      credit_cost: 1,
      parent_generation_id: currentGeneration.id,
      edit_session_id: session.id,
      edit_instruction: instruction,
      edit_response: generated.responseText || 'Elkészült.',
      edit_index: nextVersion,
      gemini_interaction_id: generated.interactionId || null,
      edit_context: {
        addedCharacterIds: addedCharacters.map((item: any) => item.id),
        uploadedReferenceCount: uploadedReferences.length,
      },
    });

    if (insertError) throw new Error(`Edited image metadata save failed: ${insertError.message}`);

    const { error: userMessageError } = await supabase.from('image_edit_messages').insert({
      session_id: session.id,
      owner_id: user.id,
      role: 'user',
      content: instruction,
      generation_id: generationId,
      metadata: {
        addedCharacterIds: addedCharacters.map((item: any) => ({ id: item.id, name: item.name })),
        uploadedReferenceCount: uploadedReferences.length,
      },
    });
    if (userMessageError) throw new Error(`Edit message save failed: ${userMessageError.message}`);

    const { error: assistantMessageError } = await supabase.from('image_edit_messages').insert({
      session_id: session.id,
      owner_id: user.id,
      role: 'assistant',
      content: generated.responseText || 'Elkészült.',
      generation_id: generationId,
      metadata: {
        generationId,
        version: nextVersion,
      },
    });
    if (assistantMessageError) throw new Error(`Assistant message save failed: ${assistantMessageError.message}`);

    const { error: sessionUpdateError } = await supabase
      .from('image_edit_sessions')
      .update({
        current_generation_id: generationId,
        gemini_interaction_id: generated.interactionId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id)
      .eq('owner_id', user.id);

    if (sessionUpdateError) throw new Error(`Edit session update failed: ${sessionUpdateError.message}`);

    await supabase.from('generation_events').insert({
      user_id: user.id,
      status: 'success',
      provider: 'gemini',
      credits: 1,
      metadata: {
        type: 'image_edit',
        sessionId: session.id,
        generationId,
        parentGenerationId: currentGeneration.id,
        addedCharacterIds: addedCharacters.map((item: any) => item.id),
        uploadedReferenceCount: uploadedReferences.length,
      },
    });

    reserved = 0;

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      generationId,
      image: await createSignedMediaUrl(storagePath, 3600),
      assistantText: generated.responseText || 'Elkészült.',
      version: nextVersion,
      characterIds: allCharacterIds,
      creditCost: 1,
    });
  } catch (error: any) {
    if (reserved) {
      try {
        const supabase = await createSupabaseServerClient();
        await supabase.rpc('refund_generation_credits', {
          p_user_id: user.id,
          p_cost: 1,
          p_reference: 'image_edit_error',
        });
        await supabase.from('generation_events').insert({
          user_id: user.id,
          status: 'failed',
          provider: 'gemini',
          credits: 1,
          metadata: { type: 'image_edit', error: error?.message || 'unknown error' },
        });
      } catch (refundError) {
        console.error('Edit credit refund error:', refundError);
      }
    }

    console.error('Image edit error:', error);
    return NextResponse.json({ error: error?.message || 'Képszerkesztés sikertelen.' }, { status: 500 });
  }
}
