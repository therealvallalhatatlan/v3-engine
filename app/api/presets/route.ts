import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, getCurrentUser } from '../../../lib/supabase/server';
import {
  PresetRecord,
  PresetType,
  addCustomPreset,
  deleteCustomPreset,
  duplicatePreset,
  getAllPresets,
  resetBuiltinPreset,
  updatePreset,
} from '../../../lib/presetStore';


async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return { response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
  }

  const supabase = await createSupabaseServerClient();
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Preset admin check failed:', error);
    return { response: NextResponse.json({ error: 'Unable to verify preset permissions' }, { status: 500 }) };
  }
  if (profile?.plan !== 'admin') {
    return { response: NextResponse.json({ error: 'Only admins can modify the shared preset catalog.' }, { status: 403 }) };
  }

  return { userId: user.id };
}

type PresetOption = {
  id: string;
  value: string;
  label: string;
  prompt: string;
  negative?: string;
  builtin: boolean;
  updatedAt: number;
};

function toOption(preset: PresetRecord): PresetOption {
  return {
    id: preset.id,
    value: preset.key,
    label: preset.label,
    prompt: preset.prompt,
    negative: preset.negative,
    builtin: preset.builtin,
    updatedAt: preset.updatedAt,
  };
}

function isType(value: unknown): value is PresetType {
  return value === 'location' || value === 'camera' || value === 'style';
}

function validKey(key: string, type: PresetType): boolean {
  return type === 'location' && key === '' || /^[a-z0-9][a-z0-9-]{1,63}$/.test(key);
}

function keyTaken(type: PresetType, key: string, exceptId?: string): boolean {
  return getAllPresets().some((preset) => preset.type === type && preset.key === key && preset.id !== exceptId);
}

function validateText(label: string, prompt: string, negative: string): string | null {
  if (!label || label.length > 120) return 'label is required and must be <= 120 characters';
  if (prompt.length > 6000) return 'prompt must be <= 6000 characters';
  if (negative.length > 3000) return 'negative prompt must be <= 3000 characters';
  return null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const all = getAllPresets();
  return NextResponse.json({
    presets: {
      location: all.filter((preset) => preset.type === 'location').map(toOption),
      camera: all.filter((preset) => preset.type === 'camera').map(toOption),
      style: all.filter((preset) => preset.type === 'style').map(toOption),
    },
    all,
  });
}

export async function POST(req: NextRequest) {
  const permission = await requireAdmin();
  if ('response' in permission) return permission.response;
  try {
    const body = await req.json();
    if (!isType(body?.type)) return NextResponse.json({ error: 'type must be location, camera or style' }, { status: 400 });

    const type = body.type as PresetType;
    const key = String(body?.key ?? '').trim().toLowerCase();
    const label = String(body?.label ?? '').trim();
    const prompt = String(body?.prompt ?? '').trim();
    const negative = String(body?.negative ?? '').trim();

    if (!validKey(key, type)) return NextResponse.json({ error: 'key must be 2-64 chars: lowercase letters, numbers and hyphens' }, { status: 400 });
    const textError = validateText(label, prompt, negative);
    if (textError) return NextResponse.json({ error: textError }, { status: 400 });
    if (keyTaken(type, key)) return NextResponse.json({ error: 'A preset with this key already exists.' }, { status: 409 });

    const preset = addCustomPreset({ type, key, label, prompt, negative: negative || undefined });
    return NextResponse.json({ preset }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to create preset' }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const permission = await requireAdmin();
  if ('response' in permission) return permission.response;
  try {
    const body = await req.json();
    const id = String(body?.id || '').trim();
    const action = String(body?.action || 'update');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    if (action === 'reset') {
      const preset = resetBuiltinPreset(id);
      if (!preset) return NextResponse.json({ error: 'Built-in preset not found' }, { status: 404 });
      return NextResponse.json({ preset });
    }

    if (action === 'duplicate') {
      const preset = duplicatePreset(id);
      if (!preset) return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
      return NextResponse.json({ preset }, { status: 201 });
    }

    const current = getAllPresets().find((preset) => preset.id === id);
    if (!current) return NextResponse.json({ error: 'Preset not found' }, { status: 404 });

    const label = String(body?.label ?? current.label).trim();
    const prompt = String(body?.prompt ?? current.prompt).trim();
    const negative = String(body?.negative ?? current.negative ?? '').trim();
    const key = current.builtin ? current.key : String(body?.key ?? current.key).trim().toLowerCase();

    if (!validKey(key, current.type)) return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
    const textError = validateText(label, prompt, negative);
    if (textError) return NextResponse.json({ error: textError }, { status: 400 });
    if (keyTaken(current.type, key, id)) return NextResponse.json({ error: 'A preset with this key already exists.' }, { status: 409 });

    const preset = updatePreset(id, { key, label, prompt, negative: negative || undefined });
    return NextResponse.json({ preset });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to update preset' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const permission = await requireAdmin();
  if ('response' in permission) return permission.response;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const removed = deleteCustomPreset(id);
  if (!removed) return NextResponse.json({ error: 'Built-in presets cannot be deleted. Use Reset instead.' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
