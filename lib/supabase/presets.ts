import { BUILTIN_PRESETS } from '../presetCatalog';
import { getAllPresets, PresetRecord, setPresetCatalog } from '../presetStore';

type PresetRow = {
  id: string;
  preset_type: 'location' | 'camera' | 'style';
  preset_key: string;
  label: string;
  prompt: string;
  negative: string | null;
  builtin: boolean;
  default_label: string | null;
  default_prompt: string | null;
  default_negative: string | null;
  created_at: string;
  updated_at: string;
};

function fromRow(row: PresetRow): PresetRecord {
  return {
    id: row.id,
    type: row.preset_type,
    key: row.preset_key,
    label: row.label,
    prompt: row.prompt,
    negative: row.negative || undefined,
    builtin: Boolean(row.builtin),
    defaultLabel: row.default_label || undefined,
    defaultPrompt: row.default_prompt || undefined,
    defaultNegative: row.default_negative || undefined,
    createdAt: Date.parse(row.created_at) || Date.now(),
    updatedAt: Date.parse(row.updated_at) || Date.now(),
  };
}

export function toPresetRow(preset: PresetRecord) {
  return {
    id: preset.id,
    preset_type: preset.type,
    preset_key: preset.key,
    label: preset.label,
    prompt: preset.prompt,
    negative: preset.negative || null,
    builtin: preset.builtin,
    default_label: preset.defaultLabel || null,
    default_prompt: preset.defaultPrompt || null,
    default_negative: preset.defaultNegative || null,
    created_at: new Date(preset.createdAt).toISOString(),
    updated_at: new Date(preset.updatedAt).toISOString(),
  };
}

function createDefaultBuiltins(): PresetRecord[] {
  const now = Date.now();
  return BUILTIN_PRESETS.map((preset) => ({
    id: `builtin-${preset.type}-${preset.key || 'empty'}`,
    type: preset.type,
    key: preset.key,
    label: preset.label,
    prompt: preset.prompt,
    negative: preset.negative,
    builtin: true,
    defaultLabel: preset.label,
    defaultPrompt: preset.prompt,
    defaultNegative: preset.negative,
    createdAt: now,
    updatedAt: now,
  }));
}

function mergeCatalog(rows: PresetRecord[]): PresetRecord[] {
  const byKey = new Map(rows.map((item) => [`${item.type}:${item.key}`, item]));
  const mergedBuiltins = createDefaultBuiltins().map((builtin) => byKey.get(`${builtin.type}:${builtin.key}`) || builtin);
  const custom = rows.filter((item) => !item.builtin);
  const seen = new Set<string>();
  return [...mergedBuiltins, ...custom].filter((item) => {
    const key = `${item.type}:${item.key}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Refreshes the synchronous preset lookup cache from the durable Supabase table.
 * When requested by an administrator, initializes missing rows and migrates any
 * catalog that still exists in the legacy local store.
 */
export async function loadPresetCatalogFromSupabase(
  supabase: any,
  options: { seedIfNeeded?: boolean } = {},
): Promise<PresetRecord[]> {
  const { data, error } = await supabase
    .from('preset_catalog')
    .select('*')
    .order('preset_type', { ascending: true })
    .order('preset_key', { ascending: true });

  if (error) throw new Error(`Unable to load shared preset catalog: ${error.message}`);

  let rows = ((data || []) as PresetRow[]).map(fromRow);

  if (rows.length === 0 && options.seedIfNeeded) {
    // Admin-only caller may migrate the catalog previously stored in local presets.json.
    const legacy = getAllPresets();
    const { error: seedError } = await supabase
      .from('preset_catalog')
      .upsert(legacy.map(toPresetRow), { onConflict: 'id' });
    if (seedError) throw new Error(`Unable to initialize shared preset catalog: ${seedError.message}`);
    rows = legacy;
  } else if (options.seedIfNeeded) {
    const existingKeys = new Set(rows.map((item) => `${item.type}:${item.key}`));
    const missingBuiltins = createDefaultBuiltins().filter((item) => !existingKeys.has(`${item.type}:${item.key}`));
    if (missingBuiltins.length) {
      const { error: seedError } = await supabase
        .from('preset_catalog')
        .upsert(missingBuiltins.map(toPresetRow), { onConflict: 'id' });
      if (seedError) throw new Error(`Unable to restore missing built-in presets: ${seedError.message}`);
      rows = [...rows, ...missingBuiltins];
    }
  }

  const merged = mergeCatalog(rows);
  setPresetCatalog(merged);
  return merged;
}

export async function savePresetToSupabase(supabase: any, preset: PresetRecord): Promise<void> {
  const { error } = await supabase
    .from('preset_catalog')
    .upsert(toPresetRow(preset), { onConflict: 'id' });
  if (error) throw new Error(`Unable to save preset: ${error.message}`);
}

export async function deletePresetFromSupabase(supabase: any, id: string): Promise<void> {
  const { error } = await supabase
    .from('preset_catalog')
    .delete()
    .eq('id', id);
  if (error) throw new Error(`Unable to delete preset: ${error.message}`);
}
