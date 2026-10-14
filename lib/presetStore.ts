import { readJSON, writeJSON } from './fileUtils';
import { initStorage } from './paths';
import { BUILTIN_PRESETS, getBuiltinPreset } from './presetCatalog';

export type PresetType = 'location' | 'camera' | 'style';
export type PresetRecord = {
  id: string;
  type: PresetType;
  key: string;
  label: string;
  prompt: string;
  negative?: string;
  builtin: boolean;
  defaultLabel?: string;
  defaultPrompt?: string;
  defaultNegative?: string;
  createdAt: number;
  updatedAt: number;
};

const PRESETS_FILE = 'presets.json';

// Per-instance cache; the shared source of truth is Supabase in deployed environments.
let runtimePresetCache: PresetRecord[] | null = null;

function normalizePreset(raw: any): PresetRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!['location', 'camera', 'style'].includes(raw.type)) return null;
  const key = String(raw.key ?? '').trim();
  const label = String(raw.label ?? '').trim();
  const prompt = String(raw.prompt ?? '').trim();
  if (!label || (!key && raw.type !== 'location')) return null;
  return {
    id: String(raw.id || `${raw.type}-${key || 'empty'}`),
    type: raw.type,
    key,
    label,
    prompt,
    negative: String(raw.negative || '').trim() || undefined,
    builtin: Boolean(raw.builtin),
    defaultLabel: String(raw.defaultLabel || '').trim() || undefined,
    defaultPrompt: String(raw.defaultPrompt || '').trim() || undefined,
    defaultNegative: String(raw.defaultNegative || '').trim() || undefined,
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

function unique(records: PresetRecord[]): PresetRecord[] {
  const seen = new Set<string>();
  return records.filter((item) => {
    const identity = `${item.type}:${item.key}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function migrateBuiltins(): PresetRecord[] {
  initStorage();
  const raw = readJSON<any>(PRESETS_FILE);
  const existingRaw = Array.isArray(raw) ? raw : Array.isArray(raw?.presets) ? raw.presets : [];
  const existing = existingRaw.map(normalizePreset).filter(Boolean) as PresetRecord[];
  const existingByKey = new Map(existing.map((item) => [`${item.type}:${item.key}`, item]));
  const now = Date.now();

  const builtins = BUILTIN_PRESETS.map((builtin) => {
    const identity = `${builtin.type}:${builtin.key}`;
    const previous = existingByKey.get(identity);
    const customizedPrompt = Boolean(previous && previous.prompt && previous.prompt !== previous.defaultPrompt);
    const customizedNegative = Boolean(previous && previous.negative !== previous.defaultNegative);
    const customizedLabel = Boolean(previous && previous.label && previous.label !== previous.defaultLabel);

    return {
      id: previous?.id || `builtin-${builtin.type}-${builtin.key || 'empty'}`,
      type: builtin.type,
      key: builtin.key,
      label: customizedLabel ? previous!.label : builtin.label,
      prompt: customizedPrompt ? previous!.prompt : builtin.prompt,
      negative: customizedNegative ? previous!.negative : builtin.negative,
      builtin: true,
      defaultLabel: builtin.label,
      defaultPrompt: builtin.prompt,
      defaultNegative: builtin.negative,
      createdAt: previous?.createdAt || now,
      updatedAt: previous ? (customizedPrompt || customizedNegative || customizedLabel ? previous.updatedAt : now) : now,
    } satisfies PresetRecord;
  });

  const custom = existing.filter((item) => !item.builtin && !BUILTIN_PRESETS.some((builtin) => builtin.type === item.type && builtin.key === item.key));
  const merged = unique([...builtins, ...custom]);
  if (!process.env.VERCEL && JSON.stringify(raw) !== JSON.stringify(merged)) writeJSON(PRESETS_FILE, merged);
  return merged;
}

export function getAllPresets(): PresetRecord[] {
  if (runtimePresetCache) return runtimePresetCache;
  runtimePresetCache = migrateBuiltins();
  return runtimePresetCache;
}

/** Replace the per-instance lookup cache with the current shared catalog from Supabase. */
export function setPresetCatalog(presets: PresetRecord[]): void {
  runtimePresetCache = unique(presets);
}

export function getPresetsByType(type: PresetType): PresetRecord[] {
  return getAllPresets().filter((item) => item.type === type);
}

export function getPreset(type: PresetType, key: string): PresetRecord | undefined {
  return getAllPresets().find((item) => item.type === type && item.key === key);
}

export function getCustomPresets(): PresetRecord[] {
  return getAllPresets().filter((item) => !item.builtin);
}

export function addCustomPreset(input: Pick<PresetRecord, 'type' | 'key' | 'label' | 'prompt' | 'negative'>): PresetRecord {
  const now = Date.now();
  const preset: PresetRecord = { ...input, id: `custom-${input.type}-${now.toString(36)}`, builtin: false, createdAt: now, updatedAt: now };
  saveAllPresets([...getAllPresets(), preset]);
  return preset;
}

export function saveAllPresets(presets: PresetRecord[]): void {
  const normalized = unique(presets);
  runtimePresetCache = normalized;
  // Keep local development backward-compatible; Vercel's filesystem is ephemeral.
  if (!process.env.VERCEL) {
    initStorage();
    writeJSON(PRESETS_FILE, normalized);
  }
}

export function updatePreset(id: string, updates: Partial<Pick<PresetRecord, 'key' | 'label' | 'prompt' | 'negative'>>): PresetRecord | null {
  const current = getAllPresets();
  const index = current.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const source = current[index];
  current[index] = {
    ...source,
    key: source.builtin ? source.key : String(updates.key ?? source.key).trim(),
    label: String(updates.label ?? source.label).trim(),
    prompt: String(updates.prompt ?? source.prompt).trim(),
    negative: String(updates.negative ?? source.negative ?? '').trim() || undefined,
    updatedAt: Date.now(),
  };
  saveAllPresets(current);
  return current[index];
}

export function resetBuiltinPreset(id: string): PresetRecord | null {
  const current = getAllPresets();
  const index = current.findIndex((item) => item.id === id && item.builtin);
  if (index < 0) return null;
  const source = current[index];
  const original = getBuiltinPreset(source.type, source.key);
  if (!original) return null;
  current[index] = { ...source, label: original.label, prompt: original.prompt, negative: original.negative, updatedAt: Date.now() };
  saveAllPresets(current);
  return current[index];
}

export function deleteCustomPreset(id: string): boolean {
  const current = getAllPresets();
  const source = current.find((item) => item.id === id);
  if (!source || source.builtin) return false;
  saveAllPresets(current.filter((item) => item.id !== id));
  return true;
}

export function duplicatePreset(id: string): PresetRecord | null {
  const current = getAllPresets();
  const source = current.find((item) => item.id === id);
  if (!source) return null;
  const now = Date.now();
  let key = `${source.key || 'preset'}-copy`;
  let counter = 2;
  while (current.some((item) => item.type === source.type && item.key === key)) key = `${source.key || 'preset'}-copy-${counter++}`;
  const copy: PresetRecord = {
    id: `custom-${source.type}-${now.toString(36)}`,
    type: source.type,
    key,
    label: `${source.label} Copy`,
    prompt: source.prompt,
    negative: source.negative,
    builtin: false,
    createdAt: now,
    updatedAt: now,
  };
  saveAllPresets([...current, copy]);
  return copy;
}

export function hasPreset(type: PresetType, key: string): boolean {
  return Boolean(getPreset(type, key));
}
