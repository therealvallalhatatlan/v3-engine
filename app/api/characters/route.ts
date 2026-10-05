import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, getCurrentUser } from '../../../lib/supabase/server';
import { getAppCharacters } from '../../../lib/supabase/characters';
import { uploadDataUrl } from '../../../lib/supabase/media';
import { deleteCharacter } from '../../../lib/storage';
import { Character } from '../../../types';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const characters = await getAppCharacters();
  return NextResponse.json(characters);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('plan, character_slots')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: 'Unable to load user entitlements' }, { status: 500 });
  }

  if (!profile || (profile.plan !== 'paid' && profile.plan !== 'admin')) {
    return NextResponse.json({ error: 'Custom character creation requires purchased credits/character capacity.' }, { status: 403 });
  }

  const isAdmin = profile.plan === 'admin';
  let slotReserved = false;

  if (!isAdmin) {
    if ((profile.character_slots ?? 0) <= 0) {
      return NextResponse.json({ error: 'No character slots available.' }, { status: 403 });
    }

    const { data: reservedSlot, error: reserveSlotError } = await supabase.rpc('reserve_character_slot', {
      p_user_id: user.id,
    });

    if (reserveSlotError) {
      return NextResponse.json({ error: 'Unable to reserve character slot' }, { status: 500 });
    }

    if (!reservedSlot) {
      return NextResponse.json({ error: 'No character slots available.' }, { status: 403 });
    }

    slotReserved = true;
  }

  const data = await req.json();
  const { name, description, traits, imageUrls, imagePaths } = data;
  const id = String(data?.id || uuidv4()).trim();
  const userReferencePrefix = `${user.id}/characters/${id}/references/`;

  const uploadedReferencePaths = Array.isArray(imagePaths)
    ? imagePaths.filter((value: unknown): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean).slice(0, 5)
    : [];

  if (uploadedReferencePaths.some((storagePath) => !storagePath.startsWith(userReferencePrefix))) {
    return NextResponse.json({ error: 'Invalid reference image path.' }, { status: 400 });
  }

  const character: Character = {
    id,
    name: String(name || '').trim().slice(0, 120),
    description: String(description || '').trim().slice(0, 4000),
    traits: Array.isArray(traits) ? traits.map((item) => String(item).trim()).filter(Boolean).slice(0, 30) : [],
    imagePaths: uploadedReferencePaths.length ? uploadedReferencePaths : (Array.isArray(imageUrls) ? imageUrls : []),
    createdAt: Date.now(),
  };

  if (!character.name || !character.description || character.imagePaths.length === 0) {
    return NextResponse.json({ error: 'Name, description and at least one reference image are required.' }, { status: 400 });
  }

  if (character.imagePaths.length > 5) {
    return NextResponse.json({ error: 'Maximum 5 reference images allowed.' }, { status: 400 });
  }

  const { error } = await supabase.from('characters').insert({
    id,
    owner_id: user.id,
    type: 'user',
    name: character.name,
    description: character.description,
    traits: character.traits,
  });

  if (error) {
    if (slotReserved) await supabase.rpc('refund_character_slot', { p_user_id: user.id });
    console.error('Character insert error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    const referencePaths: string[] = [];

    if (uploadedReferencePaths.length) {
      referencePaths.push(...uploadedReferencePaths);
    } else {
      for (let index = 0; index < character.imagePaths.length; index += 1) {
        const storagePath = `${user.id}/characters/${id}/references/${index + 1}-reference.png`;
        await uploadDataUrl(storagePath, character.imagePaths[index]);
        referencePaths.push(storagePath);
      }
    }

    const { error: imagesError } = await supabase.from('character_images').insert(
      referencePaths.map((storagePath) => ({
        character_id: id,
        storage_path: storagePath,
        image_type: 'reference',
      }))
    );

    if (imagesError) throw imagesError;
  } catch (mediaError: any) {
    await supabase.from('characters').delete().eq('id', id).eq('owner_id', user.id);
    if (slotReserved) await supabase.rpc('refund_character_slot', { p_user_id: user.id });
    try {
      if (uploadedReferencePaths.length) {
        await supabase.storage.from('v3-media').remove(uploadedReferencePaths);
      }
    } catch {
      // Best-effort cleanup of direct browser uploads.
    }
    return NextResponse.json({ error: mediaError?.message || 'Failed to store reference images' }, { status: 500 });
  }


  // Legacy local persistence is intentionally no longer used as source of truth.
  return NextResponse.json({ ...character, ownerId: user.id, type: 'user' }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = String(body?.id || '').trim();
  if (!id) return NextResponse.json({ error: 'Missing character id' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: character, error: findError } = await supabase
    .from('characters')
    .select('id, owner_id, type')
    .eq('id', id)
    .maybeSingle();

  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
  if (!character) return NextResponse.json({ error: 'Character not found' }, { status: 404 });
  if (character.type === 'system') {
    return NextResponse.json({ error: 'System characters cannot be deleted.' }, { status: 403 });
  }
  if (character.owner_id !== user.id) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const { error } = await supabase.from('characters').delete().eq('id', id).eq('owner_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: ownerProfile } = await supabase.from('profiles').select('plan').eq('id', user.id).maybeSingle();
  if (ownerProfile?.plan !== 'admin') await supabase.rpc('refund_character_slot', { p_user_id: user.id });

  try {
    deleteCharacter(id);
  } catch {
    // Database deletion is the source of truth.
  }

  return NextResponse.json({ ok: true, id });
}
