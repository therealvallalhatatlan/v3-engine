'use client';

import LoadingScreen from '../components/LoadingScreen';

import { useEffect, useMemo, useState } from 'react';

type PresetType = 'location' | 'camera' | 'style';
type Preset = {
  id: string;
  type: PresetType;
  key: string;
  label: string;
  prompt: string;
  negative?: string;
  builtin: boolean;
  updatedAt: number;
};

const TYPES: { value: PresetType; label: string }[] = [
  { value: 'location', label: 'Helyszínpreset' },
  { value: 'camera', label: 'Kamera' },
  { value: 'style', label: 'Stílus' },
];

const EMPTY = { type: 'location' as PresetType, key: '', label: '', prompt: '', negative: '' };

export default function PresetsPage() {
  const [type, setType] = useState<PresetType>('location');
  const [presets, setPresets] = useState<Preset[]>([]);
  const [editing, setEditing] = useState<Preset | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/presets', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Nem sikerült betölteni a preseteket.');
      setPresets(Array.isArray(data.all) ? data.all : []);
    } catch (e: any) {
      setError(e.message || 'Nem sikerült betölteni a preseteket.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' })
      .then((response) => response.json())
      .then((account) => setIsAdmin(account?.plan === 'admin'))
      .catch(() => setIsAdmin(false));
  }, []);

  const filtered = useMemo(() => presets.filter((preset) => preset.type === type), [presets, type]);

  const resetForm = (nextType = type) => {
    setEditing(null);
    setForm({ ...EMPTY, type: nextType });
    setMessage('');
    setError('');
  };

  const editPreset = (preset: Preset) => {
    setType(preset.type);
    setEditing(preset);
    setForm({ type: preset.type, key: preset.key, label: preset.label, prompt: preset.prompt, negative: preset.negative || '' });
    setMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const payload = editing
        ? { id: editing.id, label: form.label, prompt: form.prompt, negative: form.negative }
        : form;
      const response = await fetch('/api/presets', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Nem sikerült menteni a presetet.');
      await load();
      const saved = data.preset as Preset;
      setMessage(editing ? 'Preset frissítve.' : `Preset létrehozva: ${saved.label}`);
      resetForm(saved.type);
    } catch (e: any) {
      setError(e.message || 'Nem sikerült menteni a presetet.');
    } finally {
      setSaving(false);
    }
  };

  const action = async (preset: Preset, actionName: 'reset' | 'duplicate') => {
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/presets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: preset.id, action: actionName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'A művelet nem sikerült.');
      await load();
      if (actionName === 'duplicate' && data.preset) editPreset(data.preset);
      setMessage(actionName === 'reset' ? `${preset.label} visszaállítva gyári értékekre.` : `${preset.label} lemásolva.`);
    } catch (e: any) {
      setError(e.message || 'A preset művelet nem sikerült.');
    }
  };

  const remove = async (preset: Preset) => {
    if (preset.builtin) {
      setMessage('A beépített presetek nem törölhetők. Használd a Visszaállítás gombot, vagy másold le és szerkeszd a másolatot.');
      return;
    }
    if (!window.confirm(`Biztosan törlöd ezt: „${preset.label}”?`)) return;
    try {
      const response = await fetch(`/api/presets?id=${encodeURIComponent(preset.id)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Nem sikerült törölni a presetet.');
      if (editing?.id === preset.id) resetForm(preset.type);
      await load();
      setMessage('Preset törölve.');
    } catch (e: any) {
      setError(e.message || 'Nem sikerült törölni a presetet.');
    }
  };

  if (isAdmin === null) return <LoadingScreen />;

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-black text-gray-100 font-mono flex items-center justify-center p-6">
        <section className="w-full max-w-lg rounded-2xl border border-gray-800 bg-zinc-950 p-8 text-center">
          <div className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-3">ADMIN ONLY</div>
          <h1 className="text-2xl font-bold">Presetkezelés</h1>
          <p className="mt-3 text-sm leading-6 text-gray-400">A közös helyszín-, kamera- és stíluskatalógust csak admin módosíthatja. A generálásban elérhető presetek ettől függetlenül használhatók.</p>
          <a href="/" className="mt-6 inline-flex rounded-lg border border-gray-700 px-4 py-2 text-sm hover:border-gray-500">Vissza a karakterekhez</a>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-gray-100 font-mono p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-indigo-400 mb-2">Generálási konfiguráció</div>
            <h1 className="text-3xl md:text-4xl font-bold">Presetkezelő</h1>
            <p className="text-sm text-gray-400 mt-2 max-w-3xl">Az összes helyszín-, kamera- és stíluspreset egy közös, futásidejű katalógusban él. A beépített presetek szerkeszthetők; a Visszaállítás visszaadja az eredeti értékeket. A Másolás önálló egyedi presetet hoz létre.</p>
          </div>
          <a href="/" className="text-sm px-3 py-2 rounded border border-gray-700 hover:border-gray-500">← Karakterek</a>
        </header>

        <div className="flex gap-1 p-1 bg-gray-900 border border-gray-800 rounded-lg mb-6 max-w-xl">
          {TYPES.map((item) => (
            <button key={item.value} type="button" onClick={() => { setType(item.value); resetForm(item.value); }} className={`flex-1 px-3 py-2 rounded text-xs font-semibold ${type === item.value ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>
              {item.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 h-fit">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold">{editing ? `Szerkesztés: ${editing.label}` : `Új ${TYPES.find((item) => item.value === type)?.label}`}</h2>
              {editing && <span className="text-[10px] uppercase tracking-wide text-indigo-400">{editing.builtin ? 'Beépített' : 'Egyedi'}</span>}
            </div>

            <form onSubmit={save} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Kulcs</label>
                <input required disabled={Boolean(editing?.builtin)} value={form.key} onChange={(e) => setForm((prev) => ({ ...prev, key: e.target.value }))} placeholder={type === 'location' ? 'elhagyott-plaza' : 'egyszer-hasznalatos-vaku'} className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-sm disabled:opacity-50" />
                <div className="text-[11px] text-gray-500 mt-1">2–64 karakter, kisbetűk, számok és kötőjelek. A beépített kulcsok rögzítve vannak, hogy a korábban mentett űrlapok továbbra is működjenek.</div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Megjelenő név</label>
                <input required value={form.label} onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))} className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Prompt</label>
                <textarea required rows={10} value={form.prompt} onChange={(e) => setForm((prev) => ({ ...prev, prompt: e.target.value }))} className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-sm" />
              </div>
              {type === 'style' && (
                <div>
                  <label className="block text-xs font-semibold mb-1">Negatív prompt</label>
                  <textarea rows={5} value={form.negative} onChange={(e) => setForm((prev) => ({ ...prev, negative: e.target.value }))} className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-sm" />
                </div>
              )}
              {error && <div className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded p-2">{error}</div>}
              {message && <div className="text-sm text-green-300 bg-green-950/30 border border-green-900 rounded p-2">{message}</div>}
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={saving} className="flex-1 min-w-[150px] py-2 rounded bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-sm font-semibold">{saving ? 'Mentés…' : editing ? 'Módosítások mentése' : 'Preset hozzáadása'}</button>
                {editing && <button type="button" onClick={() => resetForm()} className="px-4 py-2 rounded border border-gray-700 hover:border-gray-500 text-sm">Mégse</button>}
              </div>
            </form>
          </section>

          <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-end justify-between gap-4 mb-4">
              <div>
                <h2 className="text-xl font-bold">{TYPES.find((item) => item.value === type)?.label}</h2>
                <p className="text-xs text-gray-500 mt-1">{filtered.length} preset</p>
              </div>
              <button type="button" onClick={load} className="text-xs px-3 py-2 rounded border border-gray-700 hover:border-gray-500">Frissítés</button>
            </div>

            {loading ? <LoadingScreen /> : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {filtered.map((preset) => (
                  <article key={preset.id} className={`rounded-xl border p-4 ${preset.builtin ? 'border-gray-800 bg-gray-800/40' : 'border-indigo-900/60 bg-indigo-950/20'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{preset.label}</h3>
                        <div className="text-[11px] text-gray-500 mt-1">{preset.key || '(nincs kulcs)'}</div>
                      </div>
                      <span className={`text-[10px] uppercase tracking-wide ${preset.builtin ? 'text-gray-500' : 'text-indigo-400'}`}>{preset.builtin ? 'Beépített' : 'Egyedi'}</span>
                    </div>
                    <div className="mt-3 text-xs text-gray-400 whitespace-pre-wrap line-clamp-6">{preset.prompt || '(nincs prompt)'}</div>
                    <div className="flex flex-wrap gap-2 mt-4">
                      <button type="button" onClick={() => editPreset(preset)} className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-xs">Szerkesztés</button>
                      <button type="button" onClick={() => action(preset, 'duplicate')} className="px-3 py-1.5 rounded border border-gray-700 hover:border-gray-500 text-xs">Másolás</button>
                      {preset.builtin && <button type="button" onClick={() => action(preset, 'reset')} className="px-3 py-1.5 rounded border border-yellow-900/70 hover:border-yellow-600 text-yellow-300 text-xs">Visszaállítás</button>}
                      <button type="button" onClick={() => remove(preset)} className="px-3 py-1.5 rounded border border-gray-700 hover:border-red-500 hover:text-red-300 text-xs">{preset.builtin ? 'Védett' : 'Törlés'}</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="mt-6 rounded-xl border border-gray-800 bg-gray-950 p-5 text-sm text-gray-400">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Tartós tárolás</div>
          <p>A tartós forrás a Supabase <code className="text-gray-300">public.preset_catalog</code> táblája. A szerver minden generálás előtt frissíti a helyi gyorsítótárat, így a módosítások több Vercel-példányon is egységesen érvényesülnek.</p>
        </section>
      </div>
    </main>
  );
}
