import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/supabase/server';
import { createSupabaseAdminClient } from '../../../../../lib/supabase/admin';
import { v4 as uuidv4 } from 'uuid';

const MAX_REFERENCE_IMAGES = 6;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function getAdminAndCharacter(characterId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };

  const supabase = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) return { error: NextResponse.json({ error: 'Unable to load account' }, { status: 500 }) };
  if (!profile || profile.plan !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }

  const { data: character, error: characterError } = await supabase
    .from('characters')
    .select('id, name, type')
    .eq('id', characterId)
    .maybeSingle();

  if (characterError) return { error: NextResponse.json({ error: characterError.message }, { status: 500 }) };
  if (!character) return { error: NextResponse.json({ error: 'Character not found' }, { status: 404 }) };
  if (character.type !== 'system') {
    return { error: NextResponse.json({ error: 'Reference management here is only for system characters.' }, { status: 400 }) };
  }

  return { user, supabase, character };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const characterId = String(params.id || '').trim();
  const auth = await getAdminAndCharacter(characterId);
  if (auth.error) return auth.error;

  const { supabase } = auth;
  const { data, error } = await supabase
    .from('character_images')
    .select('id, storage_path, image_type, created_at')
    .eq('character_id', characterId)
    .eq('image_type', 'reference')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const images = [];
  for (const image of data || []) {
    try {
      const { data: signed, error: signError } = await supabase.storage
        .from('v3-media')
        .createSignedUrl(image.storage_path, 3600);

      if (signError || !signed?.signedUrl) throw signError || new Error('Unable to sign image');

      images.push({
        id: image.id,
        path: image.storage_path,
        url: signed.signedUrl,
        created: new Date(image.created_at).getTime(),
      });
    } catch (error) {
      console.error('Unable to sign character reference:', image.storage_path, error);
    }
  }

  return NextResponse.json({ images });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const characterId = String(params.id || '').trim();
  const auth = await getAdminAndCharacter(characterId);
  if (auth.error) return auth.error;

  const { supabase } = auth;

  const { data: existing, error: existingError } = await supabase
    .from('character_images')
    .select('id, storage_path')
    .eq('character_id', characterId)
    .eq('image_type', 'reference');

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const mode = String(body?.mode || 'complete').trim();

  if (mode === 'prepare') {
    const files = Array.isArray(body?.files) ? body.files : [];
    if (!files.length) {
      return NextResponse.json({ error: 'At least one reference image is required.' }, { status: 400 });
    }
    if (files.length + (existing?.length || 0) > MAX_REFERENCE_IMAGES) {
      return NextResponse.json({ error: `Maximum ${MAX_REFERENCE_IMAGES} reference images allowed.` }, { status: 400 });
    }

    try {
      const uploads = [];
      for (const file of files) {
        const contentType = String(file?.contentType || '').toLowerCase();
        const size = Number(file?.size || 0);
        if (!ALLOWED_TYPES.has(contentType)) {
          throw new Error('Csak JPG, PNG vagy WebP kép tölthető fel.');
        }
        if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) {
          throw new Error('Egy referencia-kép legfeljebb 8 MB lehet.');
        }

        const extension = contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/webp' ? 'webp' : 'png';
        const path = `system/characters/${characterId}/references/${Date.now()}-${uuidv4()}.${extension}`;
        const { data, error } = await supabase.storage.from('v3-media').createSignedUploadUrl(path);
        if (error || !data?.token) {
          throw new Error(error?.message || 'Nem sikerült feltöltési jogosultságot létrehozni.');
        }

        uploads.push({ path, token: data.token, contentType });
      }

      return NextResponse.json({ ok: true, uploads });
    } catch (error: any) {
      return NextResponse.json({ error: error?.message || 'Nem sikerült a referencia-képek feltöltését előkészíteni.' }, { status: 500 });
    }
  }

  if (mode === 'cleanup') {
    const paths = Array.isArray(body?.paths)
      ? body.paths.filter((value: unknown): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean)
      : [];

    const prefix = `system/characters/${characterId}/references/`;
    const ownPaths = paths.filter((value) => value.startsWith(prefix));
    if (ownPaths.length) {
      const { error: cleanupError } = await supabase.storage.from('v3-media').remove(ownPaths);
      if (cleanupError) {
        return NextResponse.json({ error: cleanupError.message }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true, removed: ownPaths.length });
  }

  const uploadedPaths = Array.isArray(body?.uploadedPaths)
    ? body.uploadedPaths.filter((value: unknown): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean)
    : [];

  if (!uploadedPaths.length) {
    return NextResponse.json({ error: 'At least one uploaded reference image is required.' }, { status: 400 });
  }
  if (uploadedPaths.length + (existing?.length || 0) > MAX_REFERENCE_IMAGES) {
    return NextResponse.json({ error: `Maximum ${MAX_REFERENCE_IMAGES} reference images allowed.` }, { status: 400 });
  }

  const prefix = `system/characters/${characterId}/references/`;
  if (uploadedPaths.some((path) => !path.startsWith(prefix))) {
    return NextResponse.json({ error: 'Invalid reference image path.' }, { status: 400 });
  }

  const inserted: Array<{ id: string; storage_path: string }> = [];
  try {
    for (const path of uploadedPaths) {
      const { data: row, error: insertError } = await supabase
        .from('character_images')
        .insert({
          character_id: characterId,
          storage_path: path,
          image_type: 'reference',
        })
        .select('id, storage_path')
        .single();

      if (insertError) throw insertError;
      inserted.push(row);
    }
  } catch (error: any) {
    if (inserted.length) {
      await supabase.from('character_images').delete().in('id', inserted.map((item) => item.id));
    }
    await supabase.storage.from('v3-media').remove(uploadedPaths);
    return NextResponse.json({ error: error?.message || 'Failed to save reference images' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, added: inserted.length });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const characterId = String(params.id || '').trim();
  const auth = await getAdminAndCharacter(characterId);
  if (auth.error) return auth.error;

  const { supabase } = auth;
  const body = await req.json().catch(() => ({}));
  const imageId = String(body?.imageId || '').trim();
  if (!imageId) return NextResponse.json({ error: 'Missing imageId' }, { status: 400 });

  const { data: image, error: imageError } = await supabase
    .from('character_images')
    .select('id, storage_path')
    .eq('id', imageId)
    .eq('character_id', characterId)
    .eq('image_type', 'reference')
    .maybeSingle();

  if (imageError) return NextResponse.json({ error: imageError.message }, { status: 500 });
  if (!image) return NextResponse.json({ error: 'Reference image not found' }, { status: 404 });

  const { count, error: countError } = await supabase
    .from('character_images')
    .select('id', { count: 'exact', head: true })
    .eq('character_id', characterId)
    .eq('image_type', 'reference');

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
  if ((count || 0) <= 1) {
    return NextResponse.json({ error: 'A karakternek legalább egy referenciaképet meg kell tartani.' }, { status: 400 });
  }

  const { error: deleteRowError } = await supabase
    .from('character_images')
    .delete()
    .eq('id', imageId)
    .eq('character_id', characterId);

  if (deleteRowError) return NextResponse.json({ error: deleteRowError.message }, { status: 500 });

  const { error: storageError } = await supabase.storage.from('v3-media').remove([image.storage_path]);
  if (storageError) console.error('Reference storage delete failed:', storageError);

  return NextResponse.json({ ok: true, id: imageId });
}
