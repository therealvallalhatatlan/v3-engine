'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface ImageInfo {
  filename: string;
  url: string;
  created: number;
  meta?: {
    characterId?: string;
    characterIds?: string[];
    duoKey?: string;
    aliasMap?: Record<string, string>;
    style?: string;
    styleIntensity?: number;
    camera?: string;
    location?: string;
    mood?: string;
    variant?: 'single' | 'A' | 'B';
  } | null;
}

interface AnimationJob {
  jobId: string;
  prompt?: string;
  motionPrompt?: string;
  durationSeconds: number;
  status: 'queued' | 'processing' | 'done' | 'failed' | 'canceled';
  videoUrl?: string;
  sourceImageUrl?: string;
  lastFrameImageUrl?: string;
  error?: string;
  createdAt: number;
}

type FrameTarget = 'start' | 'end' | null;

const DURATION_OPTIONS = [5, 8, 10, 15, 20];

function statusLabel(status: AnimationJob['status']) {
  switch (status) {
    case 'queued':
      return 'Sorban áll';
    case 'processing':
      return 'Generálás folyamatban';
    case 'done':
      return 'Elkészült';
    case 'failed':
      return 'Sikertelen';
    case 'canceled':
      return 'Megszakítva';
    default:
      return status;
  }
}

function statusBadgeClass(status: AnimationJob['status']) {
  switch (status) {
    case 'queued':
      return 'border-amber-800 bg-amber-950/60 text-amber-300';
    case 'processing':
      return 'border-indigo-800 bg-indigo-950/60 text-indigo-300';
    case 'done':
      return 'border-emerald-800 bg-emerald-950/60 text-emerald-300';
    case 'failed':
      return 'border-red-900 bg-red-950/50 text-red-300';
    case 'canceled':
      return 'border-gray-700 bg-gray-900 text-gray-500';
    default:
      return 'border-gray-700 bg-gray-900 text-gray-400';
  }
}

function relativeTime(ts: number) {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'most';
  if (mins < 60) return `${mins}p`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}ó`;
  return `${Math.floor(hours / 24)}n`;
}

function jobPrompt(job: AnimationJob) {
  return job.prompt || job.motionPrompt || '';
}

interface Props {
  characterId: string;
  images: ImageInfo[];
  initialSelectedUrl?: string;
  characterIds?: string[];
}

export default function AnimationPanel({
  characterId,
  images,
  initialSelectedUrl,
  characterIds = [],
}: Props) {
  const [startUrl, setStartUrl] = useState(initialSelectedUrl || images[0]?.url || '');
  const [endUrl, setEndUrl] = useState('');
  const [pickerMode, setPickerMode] = useState<FrameTarget>(null);
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(5);
  const [jobs, setJobs] = useState<AnimationJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const prevJobStatusRef = useRef<Map<string, AnimationJob['status']>>(new Map());

  useEffect(() => {
    if (initialSelectedUrl) {
      setStartUrl(initialSelectedUrl);
    }
  }, [initialSelectedUrl]);

  useEffect(() => {
    if (!startUrl && images.length > 0) {
      setStartUrl(images[0].url);
    }
  }, [images, startUrl]);

  const loadJobs = useCallback(async () => {
    try {
      const response = await fetch(`/api/animations/${characterId}/list`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Nem sikerült betölteni a videókat.');
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (fetchError: any) {
      setError(fetchError?.message || 'Nem sikerült betölteni a videókat.');
    }
  }, [characterId]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    const pending = jobs.filter((job) => job.status === 'queued' || job.status === 'processing');
    if (!pending.length) return;

    const interval = window.setInterval(async () => {
      const updated = await Promise.all(
        pending.map(async (job) => {
          try {
            const response = await fetch(
              `/api/animations/${characterId}/${job.jobId}/status`,
              { cache: 'no-store' },
            );
            const data = await response.json();

            if (!response.ok) {
              return {
                ...job,
                status: 'failed' as const,
                error: data?.error || `Státuszlekérdezési hiba (${response.status})`,
              };
            }

            return data.job || job;
          } catch (pollError: any) {
            return {
              ...job,
              status: 'failed' as const,
              error: pollError?.message || 'A videó állapotának lekérdezése sikertelen.',
            };
          }
        }),
      );

      setJobs((current) =>
        current.map((job) => updated.find((item) => item.jobId === job.jobId) || job),
      );
    }, 5000);

    return () => window.clearInterval(interval);
  }, [characterId, jobs]);

  const selectedStartImage = useMemo(
    () => images.find((image) => image.url === startUrl) || null,
    [images, startUrl],
  );
  const selectedEndImage = useMemo(
    () => images.find((image) => image.url === endUrl) || null,
    [images, endUrl],
  );

  const visiblePickerImages = images;
  const activeJobs = jobs.filter((job) => job.status === 'queued' || job.status === 'processing');
  const finishedJobs = jobs
    .filter((job) => job.status === 'done' || job.status === 'failed' || job.status === 'canceled')
    .sort((a, b) => b.createdAt - a.createdAt);

  const submitAnimation = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!startUrl) {
      setError('Válassz egy első képkockát.');
      return;
    }

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length < 4) {
      setError('Írd le röviden, milyen mozgást szeretnél.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const selectedCharacterIds = selectedStartImage?.meta?.characterIds || characterIds;

      const response = await fetch('/api/animations/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          characterIds: selectedCharacterIds,
          duoKey: selectedStartImage?.meta?.duoKey,
          sourceImageUrl: startUrl,
          lastFrameImageUrl: endUrl || undefined,
          prompt: trimmedPrompt,
          durationSeconds: duration,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'A videó generálása nem indult el.');
      }

      setPrompt('');
      await loadJobs();
    } catch (submitError: any) {
      setError(submitError?.message || 'A videó generálása nem indult el.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (jobId: string) => {
    try {
      const response = await fetch(
        `/api/animations/${characterId}/${jobId}/cancel`,
        { method: 'POST' },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'A generálás megszakítása nem sikerült.');
      setJobs((current) => current.map((job) => (job.jobId === jobId ? data.job : job)));
    } catch (cancelError: any) {
      setError(cancelError?.message || 'A generálás megszakítása nem sikerült.');
    }
  };

  const selectFrame = (url: string) => {
    if (pickerMode === 'start') {
      setStartUrl(url);
    } else if (pickerMode === 'end') {
      setEndUrl(url);
    }
    setPickerMode(null);
  };

  const selectLatestCompleted = (job: AnimationJob) => {
    if (job.videoUrl) {
      window.setTimeout(() => {
        const video = document.getElementById(`video-${job.jobId}`);
        if (video instanceof HTMLVideoElement) {
          void video.play().catch(() => undefined);
        }
      }, 50);
    }
  };

  useEffect(() => {
    const prev = prevJobStatusRef.current;
    const justFinished = jobs.find(
      (job) =>
        prev.get(job.jobId) !== undefined &&
        prev.get(job.jobId) !== 'done' &&
        job.status === 'done' &&
        job.videoUrl,
    );

    const next = new Map<string, AnimationJob['status']>();
    for (const job of jobs) next.set(job.jobId, job.status);
    prevJobStatusRef.current = next;

    if (justFinished) {
      void selectLatestCompleted(justFinished);
    }
  }, [jobs]);

  return (
    <div className="space-y-6 xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:space-y-3 xl:overflow-hidden">
      <div className="shrink-0 border-b border-gray-800 pb-3">

        <div className="text-[11px] uppercase tracking-[0.22em] text-gray-600">VIDEO ENGINE</div>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">Videó készítése</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
          Egy képhez adj mozgást. Az első képkocka kötelező, az utolsó képkocka opcionális.
          A videó képarányát automatikusan az első képkocka tartja meg.
        </p>
      </div>

      <div className="xl:grid xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(400px,0.72fr)_minmax(0,1.28fr)] xl:gap-4">
        <section className="space-y-4 xl:min-h-0 xl:overflow-y-auto xl:pr-2">
      {images.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-800 bg-black/30 p-8 text-center">
          <div className="text-sm font-semibold text-gray-300">Még nincs használható kép.</div>
          <div className="mt-1 text-xs text-gray-600">
            Először generálj egy képet, majd itt megmozgathatod.
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-gray-800 bg-black overflow-hidden">
            <div className="flex min-h-[280px] max-h-[520px] items-center justify-center bg-zinc-950 p-3 sm:p-5">
              {selectedStartImage ? (
                <div className="relative flex max-h-[480px] max-w-full items-center justify-center">
                  <img
                    src={selectedStartImage.url}
                    alt={selectedStartImage.filename}
                    className="max-h-[480px] max-w-full w-auto rounded-lg object-contain shadow-2xl"
                  />
                  <div className="absolute left-3 top-3 rounded-full border border-white/20 bg-black/75 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                    START
                  </div>
                  {selectedEndImage && (
                    <div className="absolute bottom-3 right-3 overflow-hidden rounded-lg border border-white/20 bg-black/80 shadow-xl">
                      <img
                        src={selectedEndImage.url}
                        alt={selectedEndImage.filename}
                        className="h-16 w-24 object-cover"
                      />
                      <div className="border-t border-white/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-gray-300">
                        END
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-600">Válassz egy első képkockát.</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setPickerMode('start')}
              className={`group rounded-xl border p-3 text-left transition ${
                pickerMode === 'start' ? 'border-white bg-zinc-900' : 'border-gray-800 bg-zinc-950 hover:border-gray-600'
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">01</div>
                  <div className="text-sm font-semibold text-white">Első képkocka</div>
                </div>
                <span className="rounded-full border border-gray-700 px-2 py-1 text-[10px] text-gray-400">Kötelező</span>
              </div>
              {selectedStartImage ? (
                <div className="flex items-center gap-3">
                  <img
                    src={selectedStartImage.url}
                    alt={selectedStartImage.filename}
                    className="h-20 w-28 rounded-lg bg-black object-cover"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-xs text-gray-300">{selectedStartImage.filename}</div>
                    <div className="mt-1 text-[10px] text-gray-600">Kiválasztva a galériából</div>
                  </div>
                </div>
              ) : (
                <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-gray-800 text-xs text-gray-600">
                  Válassz egy képet
                </div>
              )}
            </button>

            <button
              type="button"
              onClick={() => setPickerMode('end')}
              className={`group rounded-xl border p-3 text-left transition ${
                pickerMode === 'end' ? 'border-white bg-zinc-900' : 'border-gray-800 bg-zinc-950 hover:border-gray-600'
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">02</div>
                  <div className="text-sm font-semibold text-white">Utolsó képkocka</div>
                </div>
                <span className="rounded-full border border-gray-800 px-2 py-1 text-[10px] text-gray-600">Opcionális</span>
              </div>
              {selectedEndImage ? (
                <div className="flex items-center gap-3">
                  <img
                    src={selectedEndImage.url}
                    alt={selectedEndImage.filename}
                    className="h-20 w-28 rounded-lg bg-black object-cover"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-xs text-gray-300">{selectedEndImage.filename}</div>
                    <div className="mt-1 text-[10px] text-gray-600">A videó vége ehhez igazodik</div>
                  </div>
                </div>
              ) : (
                <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-gray-800 text-xs text-gray-600">
                  + Válassz utolsó képkockát
                </div>
              )}
            </button>
          </div>

          {pickerMode && (
            <section className="rounded-2xl border border-gray-800 bg-zinc-950 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-gray-600">
                    GALÉRIA
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {pickerMode === 'start' ? 'Válaszd ki az első képkockát' : 'Válaszd ki az utolsó képkockát'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPickerMode(null)}
                  className="rounded-lg border border-gray-800 px-3 py-1.5 text-xs text-gray-400 transition hover:border-gray-600 hover:text-white"
                >
                  Bezárás
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {visiblePickerImages.map((image) => {
                  const selected =
                    pickerMode === 'start'
                      ? image.url === startUrl
                      : image.url === endUrl;

                  return (
                    <button
                      key={image.url}
                      type="button"
                      onClick={() => selectFrame(image.url)}
                      className={`relative overflow-hidden rounded-lg border transition ${
                        selected ? 'border-white ring-2 ring-white/20' : 'border-gray-800 hover:border-gray-500'
                      }`}
                      aria-pressed={selected}
                    >
                      <img
                        src={image.url}
                        alt={image.filename}
                        className="aspect-[4/3] w-full bg-black object-cover"
                      />
                      {selected && (
                        <div className="absolute right-1.5 top-1.5 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-bold text-black">
                          ✓
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-black/70 px-1.5 py-1 text-left text-[9px] text-gray-300 truncate">
                        {image.meta?.style || relativeTime(image.created)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <form onSubmit={submitAnimation} className="space-y-5">
            <div className="rounded-2xl border border-gray-800 bg-zinc-950 p-4">
              <label className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">
                MOZGÁS
              </label>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={4}
                className="mt-2 w-full resize-none rounded-xl border border-gray-800 bg-black px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-gray-700 focus:border-gray-500"
                placeholder="Pl. A kamera lassan közelít, a figura a kamera felé fordítja a fejét, a kabátot finoman mozgatja a szél."
              />
              <div className="mt-2 text-[10px] leading-5 text-gray-600">
                A prompt a mozgást és a kamera viselkedését írhatja le. A képet nem kell újra bemásolnod.
              </div>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-zinc-950 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">HOSSZ</div>
                  <div className="text-sm font-semibold text-white">Videó hossza</div>
                </div>
                <div className="text-xs text-gray-500">{duration} mp</div>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {DURATION_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDuration(value)}
                    className={`rounded-lg border py-2.5 text-xs font-semibold transition ${
                      duration === value
                        ? 'border-white bg-white text-black'
                        : 'border-gray-800 bg-black text-gray-400 hover:border-gray-600 hover:text-white'
                    }`}
                    aria-pressed={duration === value}
                  >
                    {value}s
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-900/80 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !startUrl}
              className="w-full rounded-xl bg-white px-5 py-4 text-sm font-bold text-black transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? 'Videó generálása…' : 'Videó generálása'}
            </button>
          </form>
        </>
      )}

        </section>
        <section className="mt-4 space-y-4 xl:mt-0 xl:min-h-0 xl:overflow-y-auto xl:pr-2">
      {finishedJobs.length > 0 && (
        <section className="space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-gray-600">KÉSZ VIDEÓK</div>
            <h3 className="text-base font-semibold text-white">Eredmények</h3>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {finishedJobs.map((job) => (
              <article key={job.jobId} className="overflow-hidden rounded-2xl border border-gray-800 bg-zinc-950">
                {job.status === 'done' && job.videoUrl ? (
                  <video
                    id={`video-${job.jobId}`}
                    controls
                    playsInline
                    preload="metadata"
                    className="aspect-video w-full bg-black"
                    src={job.videoUrl}
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-black px-6 text-center">
                    <div>
                      <div className={`mx-auto inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold ${statusBadgeClass(job.status)}`}>
                        {statusLabel(job.status)}
                      </div>
                      {job.error && (
                        <div className="mt-3 max-w-md text-xs leading-5 text-red-300">{job.error}</div>
                      )}
                    </div>
                  </div>
                )}

                <div className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusBadgeClass(job.status)}`}>
                      {statusLabel(job.status)}
                    </span>
                    <span className="text-[10px] text-gray-600">{job.durationSeconds}s</span>
                    <span className="text-[10px] text-gray-600">{relativeTime(job.createdAt)}</span>
                  </div>

                  <div className="mt-2 text-sm leading-6 text-gray-300">{jobPrompt(job)}</div>

                  {job.status === 'done' && job.videoUrl && (
                    <a
                      href={job.videoUrl}
                      download={`video-${job.jobId}.mp4`}
                      className="mt-4 inline-flex rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-white transition hover:border-gray-500 hover:bg-zinc-900"
                    >
                      Videó letöltése
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}


      {activeJobs.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-gray-600">SORBAN</div>
              <h3 className="text-base font-semibold text-white">Folyamatban</h3>
            </div>
            <div className="text-xs text-gray-600">{activeJobs.length} videó</div>
          </div>

          {activeJobs.map((job) => {
            const startImage = images.find((image) => image.url === job.sourceImageUrl);
            const endImage = images.find((image) => image.url === job.lastFrameImageUrl);

            return (
              <div
                key={job.jobId}
                className="rounded-xl border border-gray-800 bg-zinc-950 p-3 sm:p-4"
              >
                <div className="flex gap-3">
                  <div className="flex shrink-0 gap-1">
                    {startImage && (
                      <img
                        src={startImage.url}
                        alt="Első képkocka"
                        className="h-14 w-20 rounded-lg bg-black object-cover"
                      />
                    )}
                    {endImage && (
                      <img
                        src={endImage.url}
                        alt="Utolsó képkocka"
                        className="h-14 w-20 rounded-lg bg-black object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusBadgeClass(job.status)}`}>
                        {statusLabel(job.status)}
                      </span>
                      <span className="text-[10px] text-gray-600">{relativeTime(job.createdAt)}</span>
                      <span className="text-[10px] text-gray-600">{job.durationSeconds}s</span>
                    </div>
                    <div className="line-clamp-2 text-xs leading-5 text-gray-300">{jobPrompt(job)}</div>
                    <div className="mt-1 text-[10px] text-gray-700">Automatikus frissítés 5 másodpercenként</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCancel(job.jobId)}
                    className="shrink-0 self-start rounded-lg border border-gray-800 px-2.5 py-1.5 text-[10px] text-gray-500 transition hover:border-red-900 hover:text-red-300"
                  >
                    Megszakít
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {jobs.length === 0 && (
        <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-gray-800 px-6 py-10 text-center xl:min-h-[360px]">
          <div className="max-w-md">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-800 bg-black text-2xl">▶</div>
            <div className="text-sm font-semibold text-gray-300">A generált videó itt jelenik meg</div>
            <p className="mt-2 text-xs leading-5 text-gray-600">{images.length > 0 ? "Válassz képkockát és indítsd el a videógenerálást. Az elkészült videó ezen a panelen lesz lejátszható." : "Először készíts egy képet a Generálás fülön, majd itt videóvá alakíthatod."}</p>
          </div>
        </div>
      )}
        </section>
      </div>
    </div>
  );
}
