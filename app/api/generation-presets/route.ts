import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createSupabaseServerClient, getCurrentUser } from '../../../lib/supabase/server';

type PresetScope = 'global' | 'character';

type RecipeRow = {
  id: string;
  scope: PresetScope;
  character_id: string | null;
  name: string;
  config: unknown;
  created_at: string;
  updated_at: string;
};

function validScope(value: unknown): value is PresetScope {
  return value === 'global' || value === 'character';
}

function normalizeConfig(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  let serialized = '';
  try { serialized = JSON.stringify(value); } catch { return null; }
  if (!serialized || serialized.length > 24000) return null;
  return value as Record<string, unknown>;
}

function toClient(row: RecipeRow) {
  return {
    id: row.id,
    scope: row.scope,
    characterId: row.character_id || undefined,
    name: row.name,
    data: row.config,
    createdAt: Date.parse(row.created_at) || Date.now(),
    updatedAt: Date.parse(row.updated_at) || Date.now(),
  };
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const scopeValue = req.nextUrl.searchParams.get('scope') || 'global';
  if (!validScope(scopeValue)) return NextResponse.json({ error: 'scope must be global or character' }, { status: 400 });
  const characterId = String(req.nextUrl.searchParams.get('characterId') || '').trim();
  if (scopeValue === 'character' && !characterId) {
    return NextResponse.json({ error: 'characterId is required for character-scoped presets' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('generation_presets')
    .select('id, scope, character_id, name, config, created_at, updated_at')
    .eq('user_id', user.id)
    .eq('scope', scopeValue)
    .order('updated_at', { ascending: false })
    .limit(30);

  query = scopeValue === 'character' ? query.eq('character_id', characterId) : query.is('character_id', null);
  const { data, error } = await query;
  if (error) {
    console.error('Generation preset load failed:', error);
    return NextResponse.json({ error: 'A generálási receptek betöltése sikertelen.' }, { status: 500 });
  }
  return NextResponse.json({ presets: (data || []).map((row: RecipeRow) => toClient(row)) });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const scope = body?.scope;
  const characterId = String(body?.characterId || '').trim();
  const name = String(body?.name || '').trim().slice(0, 120);
  const config = normalizeConfig(body?.data);
  if (!validScope(scope)) return NextResponse.json({ error: 'scope must be global or character' }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'A recept neve kötelező.' }, { status: 400 });
  if (!config) return NextResponse.json({ error: 'A recept beállításai hiányoznak vagy túl nagyok.' }, { status: 400 });
  if (scope === 'character' && !characterId) {
    return NextResponse.json({ error: 'characterId is required for character-scoped presets' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  if (scope === 'character') {
    const { data: character, error: characterError } = await supabase
      .from('characters')
      .select('id')
      .eq('id', characterId)
      .maybeSingle();
    if (characterError) return NextResponse.json({ error: 'Unable to verify character access' }, { status: 500 });
    if (!character) return NextResponse.json({ error: 'A karakter nem található vagy nem hozzáférhető.' }, { status: 404 });
  }

  let countQuery = supabase
    .from('generation_presets')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('scope', scope);
  countQuery = scope === 'character' ? countQuery.eq('character_id', characterId) : countQuery.is('character_id', null);
  const { count, error: countError } = await countQuery;
  if (countError) return NextResponse.json({ error: 'Unable to check recipe limit' }, { status: 500 });
  if ((count || 0) >= 30) {
    return NextResponse.json({ error: 'Ebben a receptkönyvtárban legfeljebb 30 recept lehet. Törölj egy régit, mielőtt újat mentenél.' }, { status: 409 });
  }

  const rowId = String(body?.id || uuidv4()).trim().slice(0, 128);
  const { data, error } = await supabase
    .from('generation_presets')
    .insert({
      id: rowId,
      user_id: user.id,
      scope,
      character_id: scope === 'character' ? characterId : null,
      name,
      config,
    })
    .select('id, scope, character_id, name, config, created_at, updated_at')
    .single();
  if (error) {
    console.error('Generation preset create failed:', error);
    return NextResponse.json({ error: 'A recept mentése sikertelen.' }, { status: error.code === '23505' ? 409 : 500 });
  }
  return NextResponse.json({ preset: toClient(data as RecipeRow) }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const id = String(body?.id || '').trim();
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    const name = String(body.name || '').trim().slice(0, 120);
    if (!name) return NextResponse.json({ error: 'A recept neve kötelező.' }, { status: 400 });
    updates.name = name;
  }
  if (body.data !== undefined) {
    const config = normalizeConfig(body.data);
    if (!config) return NextResponse.json({ error: 'A recept beállításai hiányoznak vagy túl nagyok.' }, { status: 400 });
    updates.config = config;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('generation_presets')
    .update(updates)
    .eq('user_id', user.id)
    .eq('id', id)
    .select('id, scope, character_id, name, config, created_at, updated_at')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'A recept frissítése sikertelen.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'A recept nem található.' }, { status: 404 });
  return NextResponse.json({ preset: toClient(data as RecipeRow) });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('generation_presets')
    .delete()
    .eq('user_id', user.id)
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'A recept törlése sikertelen.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'A recept nem található.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
