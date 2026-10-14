import React, { useEffect, useState } from 'react';

interface ImageMeta {
  characterId?: string;
  characterIds?: string[];
  style?: string;
  camera?: string;
  aspectRatio?: 'landscape-16-9' | 'portrait-9-16';
  variant?: 'single' | 'A' | 'B';
  prompt?: string;
  creditCost?: number;
}

interface ImageInfo {
  id?: string;
  filename: string;
  url: string;
  created: number;
  meta?: ImageMeta | null;
}

interface VideoInfo {
  id: string;
  filename: string;
  url: string;
  created: number;
  sourceImageUrl?: string;
  durationSeconds: number;
  prompt?: string;
  status: 'done' | 'failed' | 'canceled' | 'queued' | 'processing';
}

type GalleryItem =
  | { kind: 'image'; data: ImageInfo }
  | { kind: 'video'; data: VideoInfo };

interface Props {
  characterId: string;
  onUseForAnimation?: (image: ImageInfo) => void;
  onEdit?: (image: { id: string; url: string }) => void;
}

type Modal = 'info' | 'share' | null;

function Icon({ name }: { name: 'download' | 'play' | 'info' | 'share' | 'close' | 'copy' | 'facebook' | 'instagram' | 'mail' | 'link' | 'trash' | 'edit' }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'download') return <svg {...common}><path d="M12 3v11" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>;
  if (name === 'play') return <svg {...common}><path d="m8 5 11 7-11 7V5Z" /></svg>;
  if (name === 'info') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>;
  if (name === 'share') return <svg {...common}><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.2" /><path d="m8.2 13.2 7.6 4.2" /></svg>;
  if (name === 'close') return <svg {...common}><path d="m6 6 12 12" /><path d="m18 6-12 12" /></svg>;
  if (name === 'copy') return <svg {...common}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
  if (name === 'facebook') return <svg {...common}><path d="M14 8h3V4h-3c-3 0-5 2-5 5v3H6v4h3v4h4v-4h3l1-4h-4V9c0-.7.3-1 1-1Z" /></svg>;
  if (name === 'instagram') return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" /></svg>;
  if (name === 'mail') return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>;
  if (name === 'link') return <svg {...common}><path d="M10 13a5 5 0 0 0 7.1.1l1.8-1.8a5 5 0 0 0-7.1-7.1L10.8 5" /><path d="M14 11a5 5 0 0 0-7.1-.1l-1.8 1.8a5 5 0 0 0 7.1 7.1l1-1" /></svg>;
  if (name === 'trash') return <svg {...common}><path d="M5 7h14" /><path d="M9 7V4h6v3" /><path d="M7 7l1 13h8l1-13" /><path d="M10 11v5" /><path d="M14 11v5" /></svg>;
  if (name === 'edit') return <svg {...common}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z" /></svg>;
  return <svg {...common}><path d="M10 13a5 5 0 0 0 7.1.1l1.8-1.8a5 5 0 0 0-7.1-7.1L10.8 5" /><path d="M14 11a5 5 0 0 0-7.1-.1l-1.8 1.8a5 5 0 0 0 7.1 7.1l1-1" /></svg>;
  return <svg {...common}><path d="M5 7h14" /><path d="M9 7V4h6v3" /><path d="M7 7l1 13h8l1-13" /><path d="M10 11v5" /><path d="M14 11v5" /></svg>;
}

function formatAspectRatio(value?: ImageMeta['aspectRatio']) {
  if (value === 'portrait-9-16') return 'Álló · 9:16';
  if (value === 'landscape-16-9') return 'Fekvő · 16:9';
  return 'Nincs adat';
}

function formatVariant(value?: ImageMeta['variant']) {
  if (value === 'A') return 'A variáns';
  if (value === 'B') return 'B variáns';
  if (value === 'single') return 'Egy kép';
  return 'Nincs adat';
}

function getShareUrl(url: string) {
  return url;
}

export default function Gallery({ characterId, onUseForAnimation, onEdit }: Props) {
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [galleryError, setGalleryError] = useState('');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [shareStatus, setShareStatus] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const PAGE_SIZE = 12;
  const galleryItems: GalleryItem[] = [
    ...images.map((data) => ({ kind: 'image' as const, data })),
    ...videos.map((data) => ({ kind: 'video' as const, data })),
  ].sort((a, b) => b.data.created - a.data.created);
  const totalPages = Math.max(1, Math.ceil(galleryItems.length / PAGE_SIZE));
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageItems = galleryItems.slice(pageStart, pageStart + PAGE_SIZE);
  const selectedItem = selectedIndex === null ? null : galleryItems[selectedIndex] ?? null;
  const loadGallery = () => {
    setLoading(true);
    setGalleryError('');

    const fetchJson = async (url: string, label: string) => {
      const response = await fetch(url, { cache: 'no-store' });
      let data: any;
      try { data = await response.json(); } catch {
        throw new Error(label + ': a szerver érvénytelen választ adott.');
      }
      if (!response.ok) throw new Error(data?.error || label + ': HTTP ' + response.status);
      return data;
    };

    Promise.allSettled([
      fetchJson('/api/generated/' + characterId + '/list', 'Képek betöltése'),
      fetchJson('/api/animations/' + characterId + '/list', 'Videók betöltése'),
    ])
      .then(([imageResult, videoResult]) => {
        const errors: string[] = [];

        if (imageResult.status === 'fulfilled') {
          const imageData = imageResult.value;
          setImages(Array.isArray(imageData?.images) ? imageData.images : []);
          if (Number(imageData?.unavailableCount) > 0) errors.push(Number(imageData.unavailableCount) + ' képre nem sikerült előállítani a megnyitási linket.');
        } else {
          setImages([]);
          errors.push(imageResult.reason?.message || 'A képek betöltése sikertelen.');
        }

        if (videoResult.status === 'fulfilled') {
          const videoData = videoResult.value;
          setVideos(
            Array.isArray(videoData?.jobs)
              ? videoData.jobs
                  .filter((job: any) => job?.status === 'done' && typeof job?.videoUrl === 'string' && job.videoUrl)
                  .map((job: any): VideoInfo => ({
                    id: String(job.jobId),
                    filename: 'video-' + job.jobId + '.mp4',
                    url: String(job.videoUrl),
                    created: Number(job.createdAt) || Date.now(),
                    sourceImageUrl: typeof job.sourceImageUrl === 'string' ? job.sourceImageUrl : undefined,
                    durationSeconds: Number(job.durationSeconds) || 0,
                    prompt: typeof job.prompt === 'string' ? job.prompt : job.motionPrompt,
                    status: job.status,
                  }))
              : [],
          );
        } else {
          setVideos([]);
          errors.push(videoResult.reason?.message || 'A videók betöltése sikertelen.');
        }

        setGalleryError(errors.join(' '));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadGallery();
  }, [characterId]);

  useEffect(() => setCurrentPage(1), [characterId]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setModal(null);
        setSelectedIndex(null);
        return;
      }
      if (selectedIndex === null || galleryItems.length === 0 || modal) return;
      if (event.key === 'ArrowRight') {
        setSelectedIndex((prev) => (prev === null ? 0 : (prev + 1) % galleryItems.length));
      }
      if (event.key === 'ArrowLeft') {
        setSelectedIndex((prev) => (prev === null ? 0 : (prev - 1 + galleryItems.length) % galleryItems.length));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedIndex, galleryItems.length, modal]);

  const closeAll = () => {
    setModal(null);
    setSelectedIndex(null);
    setShareStatus('');
  };

  const openShare = (index: number | null = selectedIndex) => {
    if (index !== null) setSelectedIndex(index);
    setShareStatus('');
    setModal('share');
  };

  const deleteImage = async (image: ImageInfo) => {
    if (!image.id || deletingId) return;

    const confirmed = window.confirm('Biztosan törlöd ezt a képet? A művelet nem vonható vissza.');
    if (!confirmed) return;

    setDeletingId(image.id);
    setShareStatus('');

    try {
      const response = await fetch(`/api/generated-image/${encodeURIComponent(image.id)}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'A kép törlése sikertelen.');
      }

      setImages((current) => current.filter((item) => item.id !== image.id));
      setSelectedIndex((current) => {
        if (current === null) return null;
        if (current >= images.length - 1) return Math.max(0, images.length - 2);
        return current > 0 ? current - 1 : 0;
      });
      setModal(null);
      setShareStatus('A kép törölve.');
    } catch (error: any) {
      setShareStatus(error?.message || 'A kép törlése sikertelen.');
    } finally {
      setDeletingId(null);
    }
  };

  const selectedImage = selectedItem?.kind === 'image' ? selectedItem.data : null;
  const selectedVideo = selectedItem?.kind === 'video' ? selectedItem.data : null;

  const copyLink = async () => {
    if (!selectedImage) return;
    try {
      await navigator.clipboard.writeText(getShareUrl(selectedImage.url));
      setShareStatus('A link a vágólapra került.');
    } catch {
      setShareStatus('A link másolása nem sikerült.');
    }
  };

  const shareNative = async () => {
    if (!selectedImage || !navigator.share) {
      setShareStatus('Az eszközödön nincs natív megosztás. Használd a Facebook, Instagram, e-mail vagy link gombot.');
      return;
    }

    try {
      let sharedWithFile = false;
      try {
        const response = await fetch(selectedImage.url);
        const blob = await response.blob();
        const file = new File([blob], selectedImage.filename, { type: blob.type || 'image/jpeg' });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Generált kép',
            text: 'Ezt a képet a Vállalhatatlan Illusztrációs Motorral generáltam.',
            files: [file],
          });
          sharedWithFile = true;
        }
      } catch {
        sharedWithFile = false;
      }

      if (!sharedWithFile) {
        await navigator.share({
          title: 'Generált kép',
          text: 'Ezt a képet a Vállalhatatlan Illusztrációs Motorral generáltam.',
          url: getShareUrl(selectedImage.url),
        });
      }

      setShareStatus('Megosztás elküldve.');
    } catch (error: any) {
      if (error?.name !== 'AbortError') setShareStatus('A megosztás nem sikerült.');
    }
  };

  const shareFacebook = () => {
    if (!selectedImage) return;
    const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getShareUrl(selectedImage.url))}`;
    window.open(shareUrl, '_blank', 'noopener,noreferrer,width=760,height=620');
  };

  const shareInstagram = async () => {
    if (!selectedImage) return;
    if (navigator.share) {
      await shareNative();
      return;
    }
    try {
      await navigator.clipboard.writeText(getShareUrl(selectedImage.url));
    } catch {}
    window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
    setShareStatus('A kép linkje a vágólapra került. Mobilon a natív megosztással közvetlenül is küldhető Instagramra.');
  };

  const shareEmail = () => {
    if (!selectedImage) return;
    const subject = encodeURIComponent('Generált kép');
    const body = encodeURIComponent(`Ezt a képet a Vállalhatatlan Illusztrációs Motorral generáltam.\n\n${getShareUrl(selectedImage.url)}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const imageAreaClass = (img: ImageInfo) =>
    img.meta?.aspectRatio === 'portrait-9-16'
      ? 'aspect-[9/16]'
      : 'aspect-[16/9]';

  if (loading) return <div className="py-8 text-sm text-gray-500">Galéria betöltése...</div>;
  if (!galleryItems.length && galleryError) return <div className="my-4 rounded-xl border border-red-900/70 bg-red-950/20 p-4 text-sm text-red-200" role="alert"><div>{galleryError}</div><button type="button" onClick={loadGallery} className="mt-3 rounded-lg border border-red-800 px-3 py-2 text-xs hover:bg-red-950/60">Újrapróbálás</button></div>;
  if (!galleryItems.length) return <div className="py-8 text-sm text-gray-500">Még nincs generált kép vagy videó.</div>

  const renderInfoRows = (item: GalleryItem) => {
    if (item.kind === 'video') {
      return [
        ['Típus', 'Videó'],
        ['Dátum', new Date(item.data.created).toLocaleString('hu-HU')],
        ['Fájl', item.data.filename],
        ['Hossz', item.data.durationSeconds ? `${item.data.durationSeconds} mp` : 'Nincs adat'],
        ['Állapot', item.data.status],
      ];
    }

    const img = item.data;
    return [
      ['Dátum', new Date(img.created).toLocaleString('hu-HU')],
      ['Fájl', img.filename],
      ['Stílus', img.meta?.style || 'Nincs adat'],
      ['Kamera', img.meta?.camera || 'Nincs adat'],
      ['Képarány', formatAspectRatio(img.meta?.aspectRatio)],
      ['Variáns', formatVariant(img.meta?.variant)],
      ['Kreditköltség', typeof img.meta?.creditCost === 'number' ? String(img.meta.creditCost) : 'Nincs adat'],
      ['Karakterek', img.meta?.characterIds?.length ? img.meta.characterIds.join(', ') : 'Nincs adat'],
    ];
  };
  

  return (
    <>
      {galleryError && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-800/70 bg-amber-950/20 px-4 py-3 text-xs text-amber-100" role="alert"><span>{galleryError}</span><button type="button" onClick={loadGallery} className="shrink-0 rounded-lg border border-amber-700 px-3 py-2 hover:bg-amber-950/50">Újrapróbálás</button></div>}
      <div className="mt-4 mb-2 flex items-center justify-between text-xs text-gray-400">
        <div>{currentPage}. oldal / {totalPages}</div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage <= 1} className="rounded border border-gray-700 px-2 py-1 transition hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-40">Előző</button>
          <button type="button" onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))} disabled={currentPage >= totalPages} className="rounded border border-gray-700 px-2 py-1 transition hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-40">Következő</button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {pageItems.map((item, index) => {
          const absoluteIndex = pageStart + index;
          if (item.kind === 'video') {
            const video = item.data;
            return (
              <article key={`video-${video.id}`} className="overflow-hidden rounded-xl border border-gray-800 bg-zinc-900/80 shadow-lg">
                <button
                  type="button"
                  onClick={() => setSelectedIndex(absoluteIndex)}
                  className="group relative block aspect-video w-full overflow-hidden bg-black focus:outline-none focus:ring-2 focus:ring-white/70"
                  aria-label="Videó megnyitása"
                >
                  <video
                    src={video.url}
                    poster={video.sourceImageUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-contain"
                    onClick={(event) => event.stopPropagation()}
                  />
                  <span className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/20 bg-black/75 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">VIDEÓ</span>
                </button>

                <div className="grid grid-cols-3 gap-2 border-t border-gray-800 bg-zinc-950 p-3">
                  <a href={video.url} download title="Videó letöltése" aria-label="Videó letöltése" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-gray-700 px-3 py-2 text-gray-200 transition hover:border-gray-500 hover:bg-zinc-900">
                    <Icon name="download" />
                  </a>
                  <button type="button" onClick={() => { setSelectedIndex(absoluteIndex); setModal('info'); setShareStatus(''); }} title="Info" aria-label="Videó infó" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-gray-700 px-3 py-2 text-gray-200 transition hover:border-gray-500 hover:bg-zinc-900">
                    <Icon name="info" />
                  </button>
                  <button type="button" onClick={() => setSelectedIndex(absoluteIndex)} title="Megnyitás" aria-label="Videó megnyitása" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-white px-3 py-2 text-black transition hover:bg-gray-200">
                    <Icon name="play" />
                  </button>
                </div>
              </article>
            );
          }

          const img = item.data;
          return (
            <article key={img.id || img.filename} className="overflow-hidden rounded-xl border border-gray-800 bg-zinc-900/80 shadow-lg">
              <button type="button" onClick={() => setSelectedIndex(absoluteIndex)} className={`group block w-full ${imageAreaClass(img)} overflow-hidden bg-black focus:outline-none focus:ring-2 focus:ring-white/70`} aria-label="Kép nagy méretű megnyitása">
                <img src={img.url} alt={img.filename} className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.01]" />
              </button>

              <div className={`grid grid-cols-3 gap-2 border-t border-gray-800 bg-zinc-950 p-3 ${onEdit ? 'sm:grid-cols-6' : 'sm:grid-cols-5'}`}>
                <a href={img.url} download title="Letöltés" aria-label="Letöltés" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-gray-700 px-3 py-2 text-gray-200 transition hover:border-gray-500 hover:bg-zinc-900">
                  <Icon name="download" />
                </a>
                {onEdit && img.id && (
                  <button type="button" onClick={() => onEdit({ id: img.id!, url: img.url })} title="Szerkesztés" aria-label="Szerkesztés" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-gray-700 px-3 py-2 text-gray-200 transition hover:border-gray-500 hover:bg-zinc-900">
                    <Icon name="edit" />
                  </button>
                )}
                {onUseForAnimation && (
                  <button type="button" onClick={() => onUseForAnimation(img)} title="Videó készítése ebből a képből" aria-label="Videó készítése ebből a képből" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-gray-700 px-3 py-2 text-gray-200 transition hover:border-gray-500 hover:bg-zinc-900">
                    <Icon name="play" />
                  </button>
                )}
                <button type="button" onClick={() => { setSelectedIndex(absoluteIndex); setModal('info'); setShareStatus(''); }} title="Info" aria-label="Info" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-gray-700 px-3 py-2 text-gray-200 transition hover:border-gray-500 hover:bg-zinc-900">
                  <Icon name="info" />
                </button>
                <button type="button" onClick={() => openShare(absoluteIndex)} title="Megosztás" aria-label="Megosztás" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-white px-3 py-2 text-black shadow-md transition hover:bg-gray-200 hover:shadow-lg">
                  <Icon name="share" />
                </button>
                <button type="button" onClick={() => void deleteImage(img)} disabled={!img.id || deletingId === img.id} title="Törlés" aria-label="Törlés" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-red-900/70 px-3 py-2 text-red-300 transition hover:border-red-700 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-50">
                  <Icon name="trash" />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-between text-xs text-gray-400">
        <div>{pageItems.length} / {galleryItems.length} elem megjelenítve</div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage <= 1} className="rounded border border-gray-700 px-2 py-1 transition hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-40">Előző</button>
          <button type="button" onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))} disabled={currentPage >= totalPages} className="rounded border border-gray-700 px-2 py-1 transition hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-40">Következő</button>
        </div>
      </div>

      {selectedItem && modal === 'info' && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={closeAll}
          role="dialog"
          aria-modal="true"
          aria-label="Média adatai"
        >
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-800 bg-zinc-950 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-gray-600">GALÉRIA</div>
                <h3 className="mt-1 text-lg font-bold text-white">{selectedItem.kind === 'video' ? 'Videó adatai' : 'Kép adatai'}</h3>
              </div>
              <button type="button" onClick={closeAll} className="rounded-lg border border-gray-700 p-2 text-gray-400 transition hover:border-gray-500 hover:text-white" aria-label="Bezárás">
                <Icon name="close" />
              </button>
            </div>

            <div className="mb-5 overflow-hidden rounded-xl border border-gray-800 bg-black">
              {selectedItem.kind === 'video' ? (
                <video src={selectedItem.data.url} poster={selectedItem.data.sourceImageUrl} controls playsInline preload="metadata" className="max-h-[55vh] w-full bg-black" />
              ) : (
                <img src={selectedItem.data.url} alt={selectedItem.data.filename} className="mx-auto max-h-[55vh] w-full object-contain" />
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-800">
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {renderInfoRows(selectedItem).map(([label, value]) => (
                    <tr key={label} className="border-b border-gray-800 last:border-b-0">
                      <th className="w-40 bg-zinc-900/70 px-4 py-3 text-left font-medium text-gray-500">{label}</th>
                      <td className="px-4 py-3 text-gray-200 break-words">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedItem.kind === 'image' && selectedImage.meta?.prompt && (
              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Prompt</div>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-800 bg-black/40 p-4 text-xs leading-5 text-gray-400 whitespace-pre-wrap">
                  {selectedImage.meta.prompt}
                </div>
              </div>
            )}

            {selectedItem.kind === 'video' && selectedVideo.prompt && (
              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Mozgás prompt</div>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-800 bg-black/40 p-4 text-xs leading-5 text-gray-400 whitespace-pre-wrap">
                  {selectedVideo.prompt}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedImage && modal === 'share' && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => {
            setModal(null);
            setShareStatus('');
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Kép megosztása"
        >
          <div className="w-full max-w-lg rounded-2xl border border-gray-800 bg-zinc-950 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-gray-600">SHARE</div>
                <h3 className="mt-1 text-lg font-bold text-white">Megosztás</h3>
              </div>
              <button type="button" onClick={() => { setModal(null); setShareStatus(''); }} className="rounded-lg border border-gray-700 p-2 text-gray-400 transition hover:border-gray-500 hover:text-white" aria-label="Bezárás">
                <Icon name="close" />
              </button>
            </div>

            <div className="mb-4 overflow-hidden rounded-xl border border-gray-800 bg-black">
              <img src={selectedImage.url} alt={selectedImage.filename} className={`mx-auto max-h-72 w-full ${selectedImage.meta?.aspectRatio === 'portrait-9-16' ? 'object-contain' : 'object-contain'}`} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={shareFacebook} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-gray-700 bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:border-gray-500 hover:bg-zinc-800">
                <Icon name="facebook" />
                Facebook
              </button>
              <button type="button" onClick={shareInstagram} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-gray-700 bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:border-gray-500 hover:bg-zinc-800">
                <Icon name="instagram" />
                Instagram
              </button>
              <button type="button" onClick={shareEmail} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-gray-700 bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:border-gray-500 hover:bg-zinc-800">
                <Icon name="mail" />
                E-mail
              </button>
              <button type="button" onClick={shareNative} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-black transition hover:bg-gray-200">
                <Icon name="share" />
                Eszköz megosztása
              </button>
              <button type="button" onClick={copyLink} className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-700 px-4 py-3 text-sm font-medium text-gray-300 transition hover:border-gray-500 hover:bg-zinc-900">
                <Icon name="copy" />
                Link másolása
              </button>
            </div>

            {shareStatus && <div className="mt-4 rounded-lg border border-gray-800 bg-black/30 px-3 py-2 text-xs text-gray-400">{shareStatus}</div>}
          </div>
        </div>
      )}

      {selectedItem && modal === null && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 p-3 sm:p-5"
          onClick={() => setSelectedIndex(null)}
          role="dialog"
          aria-modal="true"
          aria-label={selectedItem.kind === 'video' ? 'Videó előnézete' : 'Kép előnézete'}
        >
          {selectedImage && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                openShare(selectedIndex);
              }}
              className="fixed right-4 top-4 z-[62] inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black shadow-2xl transition hover:bg-gray-200 sm:right-6 sm:top-6"
            >
              <Icon name="share" />
              Megosztás
            </button>
          )}

          <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedIndex(null); }} className="fixed left-4 top-4 z-[62] rounded-xl border border-gray-700 bg-black/80 p-2.5 text-gray-300 transition hover:border-gray-500 hover:text-white sm:left-6 sm:top-6" aria-label="Bezárás">
            <Icon name="close" />
          </button>

          <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedIndex((prev) => (prev === null ? 0 : (prev - 1 + galleryItems.length) % galleryItems.length)); }} className="fixed left-3 top-1/2 z-[62] hidden -translate-y-1/2 rounded-full border border-gray-700 bg-black/70 p-3 text-white transition hover:border-gray-500 md:block" aria-label="Előző média">
            ‹
          </button>

          <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedIndex((prev) => (prev === null ? 0 : (prev + 1) % galleryItems.length)); }} className="fixed right-3 top-1/2 z-[62] hidden -translate-y-1/2 rounded-full border border-gray-700 bg-black/70 p-3 text-white transition hover:border-gray-500 md:block" aria-label="Következő média">
            ›
          </button>

          <div className="flex h-full w-full items-center justify-center" onClick={(event) => event.stopPropagation()}>
            <div className="flex max-h-full max-w-[92vw] items-center justify-center">
              {selectedItem.kind === 'video' ? (
                <video src={selectedItem.data.url} poster={selectedItem.data.sourceImageUrl} controls autoPlay playsInline preload="metadata" className="max-h-[calc(100vh-2rem)] max-w-[92vw] rounded-xl bg-black object-contain shadow-2xl sm:max-h-[calc(100vh-2.5rem)]" />
              ) : (
                <img src={selectedItem.data.url} alt={selectedItem.data.filename} className="max-h-[calc(100vh-2rem)] max-w-[92vw] rounded-xl object-contain shadow-2xl sm:max-h-[calc(100vh-2.5rem)]" />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
