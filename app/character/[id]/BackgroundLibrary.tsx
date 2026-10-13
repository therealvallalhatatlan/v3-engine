'use client';

import { useEffect, useState } from 'react';

type BackgroundImage = {
  id: string;
  filename: string;
  url: string;
  created: number;
  meta?: { prompt?: string; style?: string; aspectRatio?: string } | null;
};

export default function BackgroundLibrary({
  onUseAsReference,
}: {
  onUseAsReference: (image: BackgroundImage) => void;
}) {
  const [images, setImages] = useState<BackgroundImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let canceled = false;
    fetch('/api/generated/backgrounds/list', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'A háttérkönyvtár betöltése sikertelen.');
        return data;
      })
      .then((data) => {
        if (!canceled) setImages(Array.isArray(data.images) ? data.images : []);
      })
      .catch((loadError: any) => {
        if (!canceled) setError(loadError?.message || 'A háttérkönyvtár betöltése sikertelen.');
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => { canceled = true; };
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-gray-600">ENVIRONMENT LIBRARY</div>
          <h2 className="mt-1 text-xl font-semibold text-white">Háttérkönyvtár</h2>
          <p className="mt-1 text-xs text-gray-500">A szereplő nélkül generált képeid itt maradnak, és később háttérreferenciaként is felhasználhatod őket.</p>
        </div>
        <div className="text-xs text-gray-600">{images.length} háttér</div>
      </div>

      {loading && <div className="rounded-xl border border-gray-800 p-8 text-center text-sm text-gray-500">Háttérképek betöltése…</div>}
      {error && <div className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>}

      {!loading && !error && images.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-800 p-10 text-center">
          <div className="text-sm font-semibold text-gray-300">Még nincs háttérképed</div>
          <p className="mt-2 text-xs leading-5 text-gray-600">A Generálás fülön a Szereplők résznél válaszd a „0 karakter” módot, és készítsd el az első helyszínt.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {images.map((image) => (
          <article key={image.id} className="overflow-hidden rounded-xl border border-gray-800 bg-zinc-950">
            <button type="button" className="block w-full bg-black" onClick={() => onUseAsReference(image)} title="Felhasználás háttérreferenciaként">
              <img src={image.url} alt={image.filename} className="aspect-video w-full object-contain" />
            </button>
            <div className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-gray-300">{image.meta?.style || 'Háttér'}</span>
                <span className="shrink-0 text-[10px] text-gray-600">{new Date(image.created).toLocaleDateString('hu-HU')}</span>
              </div>
              {image.meta?.prompt && <p className="line-clamp-2 text-[11px] leading-5 text-gray-500">{image.meta.prompt}</p>}
              <button type="button" onClick={() => onUseAsReference(image)} className="w-full rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 transition hover:border-gray-500 hover:bg-zinc-900">
                Háttérként használom
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
