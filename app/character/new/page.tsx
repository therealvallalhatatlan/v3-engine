'use client';

import LoadingScreen from '../../components/LoadingScreen';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../../lib/supabase/client';

type Account = {
  authenticated: boolean;
  plan?: 'free' | 'paid' | 'admin';
  generationCredits?: number;
  characterSlots?: number;
};

export default function CreateCharacterPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [traits, setTraits] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const MAX_REFERENCE_IMAGES = 5;
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

  useEffect(() => {
    fetch('/api/me')
      .then((res) => res.json())
      .then(setAccount)
      .catch(() => setAccount({ authenticated: false }));
  }, []);

  const isPaid = account?.plan === 'paid' || account?.plan === 'admin';
  const isAdmin = account?.plan === 'admin';

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setImages(Array.from(e.target.files).slice(0, MAX_REFERENCE_IMAGES));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const uploadedPaths: string[] = [];
    const supabase = createSupabaseBrowserClient();
    const userId = account?.user?.id;

    try {
      if (!userId) throw new Error('Nem sikerült azonosítani a felhasználót.');
      if (!images.length) throw new Error('Legalább egy referenciaképet válassz.');
      if (images.length > MAX_REFERENCE_IMAGES) {
        throw new Error(`Legfeljebb ${MAX_REFERENCE_IMAGES} referencia-kép tölthető fel.`);
      }

      const characterId = crypto.randomUUID();
      const referencePrefix = `${userId}/characters/${characterId}/references`;

      for (let index = 0; index < images.length; index += 1) {
        const file = images[index];

        if (!ALLOWED_TYPES.has(file.type)) {
          throw new Error('Csak JPG, PNG vagy WebP kép tölthető fel.');
        }
        if (file.size > MAX_FILE_BYTES) {
          throw new Error(`Egy referencia-kép legfeljebb 8 MB lehet: ${file.name}`);
        }

        const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png';
        const storagePath = `${referencePrefix}/${index + 1}-reference.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from('v3-media')
          .upload(storagePath, file, {
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`A referencia-kép feltöltése sikertelen: ${uploadError.message}`);
        }

        uploadedPaths.push(storagePath);
      }

      const res = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: characterId,
          name,
          description,
          traits: traits.split(',').map((t) => t.trim()).filter(Boolean),
          imagePaths: uploadedPaths,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Nem sikerült létrehozni a karaktert.');

      router.push('/');
    } catch (e: any) {
      if (uploadedPaths.length) {
        try {
          await supabase.storage.from('v3-media').remove(uploadedPaths);
        } catch {
          // Best-effort cleanup.
        }
      }
      setError(e.message || 'Hiba történt a karakter létrehozásakor.');
    } finally {
      setLoading(false);
    }
  };

  if (!account) {
    return <LoadingScreen />;
  }

  if (!account.authenticated) {
    router.replace('/auth');
    return <main className="min-h-screen bg-black text-gray-100 flex items-center justify-center font-mono">Átirányítás…</main>;
  }

  if (!isPaid) {
    return (
      <main className="min-h-screen bg-black text-gray-100 font-mono flex items-center justify-center px-6">
        <div className="w-full max-w-lg rounded-2xl border border-gray-800 bg-zinc-950 p-8 text-center">
          <div className="text-xs tracking-[0.3em] text-gray-500 mb-4">HALADÓ FUNKCIÓ</div>
          <h1 className="text-2xl font-bold mb-3">Saját karakter létrehozása</h1>
          <p className="text-sm text-gray-400">
            Saját karakterhez és a haladó generálási eszközökhöz kreditvásárlás szükséges.
          </p>
          <button type="button" onClick={() => router.push('/')} className="mt-6 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black">
            Vissza a karakterekhez
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-gray-100 font-mono flex flex-col items-center p-8">
      <form onSubmit={handleSubmit} className="bg-gray-900 p-8 rounded-lg shadow max-w-md w-full border border-gray-800">
        <h2 className="text-2xl font-bold mb-6">Karakter létrehozása</h2>

        <div className="mb-4">
          <label className="block mb-1">Név</label>
          <input className="w-full p-2 rounded bg-gray-800 border border-gray-700" value={name} onChange={e => setName(e.target.value)} required />
        </div>

        <div className="mb-4">
          <label className="block mb-1">Leírás</label>
          <textarea className="w-full p-2 rounded bg-gray-800 border border-gray-700" value={description} onChange={e => setDescription(e.target.value)} required />
        </div>

        <div className="mb-4">
          <label className="block mb-1">Jellemzők <span className="text-gray-500">(vesszővel elválasztva)</span></label>
          <input className="w-full p-2 rounded bg-gray-800 border border-gray-700" value={traits} onChange={e => setTraits(e.target.value)} required />
        </div>

        <div className="mb-4">
          <label className="block mb-1">Referenciaképek <span className="text-gray-500">(1–5)</span></label>
          <input type="file" accept="image/*" multiple onChange={handleImageChange} required className="w-full" />
          <div className="flex gap-2 mt-2 flex-wrap">
            {images.map((img, i) => <span key={i} className="text-xs text-gray-400">{img.name}</span>)}
          </div>
        </div>

        {typeof account.characterSlots === 'number' && (
          <div className="mb-4 text-xs text-gray-500">
            {isAdmin ? 'Admin hozzáférés: korlátlan karakterhely' : `Szabad karakterhely: ${account.characterSlots}`}
          </div>
        )}

        {error && <div className="text-red-500 mb-2">{error}</div>}

        <button type="submit" className="w-full bg-gray-800 py-2 rounded font-semibold hover:bg-gray-700 disabled:opacity-50" disabled={loading || (!isAdmin && (account.characterSlots ?? 0) < 1)}>
          {loading ? 'Létrehozás…' : (!isAdmin && (account.characterSlots ?? 0) < 1) ? 'Nincs szabad karakterhely' : 'Létrehozás'}
        </button>
      </form>
    </main>
  );
}
