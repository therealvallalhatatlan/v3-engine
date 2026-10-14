import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, getCurrentUser } from '../../../../../lib/supabase/server';
import { createSignedMediaUrls } from '../../../../../lib/supabase/media';

export async function GET(req: NextRequest, { params }: { params: { characterId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const characterId = String(params.characterId || '').trim();
  const duoWith = req.nextUrl.searchParams.get('duoWith')?.trim();

  if (!characterId) {
    return NextResponse.json({ error: 'Missing characterId' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const query = supabase
    .from('generated_images')
    .select('id, owner_id, character_id, character_ids, storage_path, prompt, style, camera, aspect_ratio, variant, credit_cost, parent_generation_id, edit_session_id, edit_instruction, edit_response, edit_index, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const matches = (data || []).filter((image) => {
    const ids = Array.isArray(image.character_ids) ? image.character_ids.map(String) : [];
    const primaryMatch = String(image.character_id) === characterId || ids.includes(characterId);
    if (!primaryMatch) return false;
    if (duoWith) return ids.includes(duoWith);
    return true;
  });

  const signedUrls = await createSignedMediaUrls(
    matches.map((image) => image.storage_path),
    3600,
  );

  const images = matches
    .map((image) => {
      const url = signedUrls[image.storage_path];
      if (!url) return null;

      return {
        id: image.id,
        filename: image.storage_path.split('/').pop() || image.id,
        url,
        created: new Date(image.created_at).getTime(),
        meta: {
          characterId: image.character_id,
          characterIds: Array.isArray(image.character_ids) ? image.character_ids : [],
          style: image.style,
          camera: image.camera,
          aspectRatio: image.aspect_ratio,
          variant: image.variant,
          prompt: image.prompt,
          creditCost: image.credit_cost,
          parentGenerationId: image.parent_generation_id,
          editSessionId: image.edit_session_id,
          editInstruction: image.edit_instruction,
          editResponse: image.edit_response,
          editIndex: image.edit_index,
        },
      };
    })
    .filter(Boolean);

  return NextResponse.json({ images });
}
