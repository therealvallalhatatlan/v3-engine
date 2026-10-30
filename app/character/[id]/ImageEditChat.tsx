'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type CharacterOption = {
  id: string;
  name: string;
  type?: 'system' | 'user';
};

type EditMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: {
    addedCharacterIds?: Array<{ id: string; name: string }>;
    uploadedReferenceCount?: number;
    generationId?: string;
    version?: number;
  };
};

type PendingReference = {
  id: string;
  name: string;
  dataUrl: string;
};

async function readApiResponse(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') || '';
  const raw = await response.text();

  if (contentType.toLowerCase().includes('application/json')) {
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(`A szerver hibás JSON-választ adott (HTTP ${response.status}).`);
    }
  }

  const preview = raw.trim().slice(0, 240);
  if (!response.ok) {
    const isPayloadLimit = response.status === 413 || /request entity too large|payload too large/i.test(preview);
    if (isPayloadLimit) {
      throw new Error('A referencia képek túl nagyok ehhez a feltöltési kéréshez. Kisebb képekkel próbáld újra.');
    }
    throw new Error(`A szerver nem JSON hibaválaszt adott (HTTP ${response.status}): ${preview || response.statusText}`);
  }

  throw new Error('A szerver váratlan, nem JSON választ adott.');
}

type VersionInfo = {
  id: string;
  url: string;
  version: number;
  instruction?: string | null;
};

type Props = {
  open: boolean;
  imageUrl: string;
  generationId: string;
  primaryCharacterId: string;
  characters: CharacterOption[];
  onClose: () => void;
  onImageChange: (imageUrl: string, generationId: string) => void;
};

const MAX_ATTACHMENTS = 4;

function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ImageEditChat({
  open,
  imageUrl,
  generationId,
  primaryCharacterId,
  characters,
  onClose,
  onImageChange,
}: Props) {
  const [messages, setMessages] = useState<EditMessage[]>([]);
  const [instruction, setInstruction] = useState('');
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [pendingReferences, setPendingReferences] = useState<PendingReference[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [currentGenerationId, setCurrentGenerationId] = useState(generationId);
  const [currentImageUrl, setCurrentImageUrl] = useState(imageUrl);
  const [versions, setVersions] = useState<VersionInfo[]>([
    { id: generationId, url: imageUrl, version: 0, instruction: null },
  ]);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState('');
  const [showCharacterPicker, setShowCharacterPicker] = useState(false);
  const [showReferencePicker, setShowReferencePicker] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setError('');
    setMessages([]);
    setSessionId('');
    setCurrentGenerationId(generationId);
    setCurrentImageUrl(imageUrl);
    setVersions([{ id: generationId, url: imageUrl, version: 0, instruction: null }]);
    setSelectedCharacterIds([]);
    setPendingReferences([]);
    setInstruction('');
    setShowCharacterPicker(false);
    setShowReferencePicker(false);

    const saved = window.localStorage.getItem(`v3:image-edit-session:${generationId}`);
    if (saved) {
      void loadSession(saved);
    } else {
      void loadSessionByGeneration(generationId);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const selectableCharacters = useMemo(
    () => characters.filter((item) => item.id !== primaryCharacterId && !selectedCharacterIds.includes(item.id)),
    [characters, primaryCharacterId, selectedCharacterIds],
  );

  if (!open) return null;

  const addCharacter = (id: string) => {
    if (!id || selectedCharacterIds.length >= 3) return;
    setSelectedCharacterIds((current) => [...current, id]);
    setShowCharacterPicker(false);
  };

  const removeCharacter = (id: string) => {
    setSelectedCharacterIds((current) => current.filter((item) => item !== id));
  };

  const addReferences = async (files: FileList | File[]) => {
    const incoming = Array.from(files);
    const slots = MAX_ATTACHMENTS - pendingReferences.length;
    if (incoming.length > slots) {
      setError(`Legfeljebb ${MAX_ATTACHMENTS} referencia kép lehet egy körben.`);
      return;
    }

    try {
      const loaded = await Promise.all(
        incoming.map(async (file) => ({
          id: newId(),
          name: file.name,
          dataUrl: await readFileAsDataUrl(file),
        })),
      );
      setPendingReferences((current) => [...current, ...loaded]);
      setShowReferencePicker(false);
      setError('');
    } catch {
      setError('A referencia kép beolvasása sikertelen.');
    }
  };

  const submitEdit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const text = instruction.trim();
    if (!text || loading) return;

    const userMessage: EditMessage = {
      id: newId(),
      role: 'user',
      content: text,
      metadata: {
        addedCharacterIds: selectedCharacterIds.map((id) => ({
          id,
          name: characters.find((item) => item.id === id)?.name || id,
        })),
        uploadedReferenceCount: pendingReferences.length,
      },
    };

    setMessages((current) => [...current, userMessage]);
    setInstruction('');
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/image-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId || undefined,
          sourceGenerationId: currentGenerationId,
          instruction: text,
          characterIds: selectedCharacterIds,
          referenceImages: pendingReferences.map((item) => item.dataUrl),
        }),
      });

      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data?.error || 'A képszerkesztés sikertelen.');

      const nextSessionId = String(data.sessionId || sessionId || '');
      setSessionId(nextSessionId);
      window.localStorage.setItem(`v3:image-edit-session:${generationId}`, nextSessionId);
      if (data.generationId) window.localStorage.setItem(`v3:image-edit-session:${data.generationId}`, nextSessionId);
      const nextGenerationId = String(data.generationId || currentGenerationId);
      const nextImageUrl = String(data.image || currentImageUrl);
      const nextVersion = Number(data.version || 0);

      setCurrentGenerationId(nextGenerationId);
      setCurrentImageUrl(nextImageUrl);
      setVersions((current) => {
        const next = current.filter((item) => item.id !== nextGenerationId);
        next.push({
          id: nextGenerationId,
          url: nextImageUrl,
          version: nextVersion,
          instruction: text,
        });
        return next.sort((a, b) => a.version - b.version);
      });
      setMessages((current) => [
        ...current,
        {
          id: newId(),
          role: 'assistant',
          content: String(data.assistantText || 'Elkészült.'),
          metadata: {
            generationId: data.generationId,
            version: data.version,
          },
        },
      ]);
      setSelectedCharacterIds([]);
      setPendingReferences([]);
      onImageChange(String(data.image || currentImageUrl), String(data.generationId || currentGenerationId));
    } catch (err: any) {
      setError(err?.message || 'A képszerkesztés sikertelen.');
    } finally {
      setLoading(false);
    }
  };

  const loadSession = async (id: string) => {
    if (!id) return;
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/image-edit?sessionId=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'A szerkesztési előzmények nem tölthetők be.');
      setSessionId(id);
      window.localStorage.setItem(`v3:image-edit-session:${generationId}`, id);
      setVersions(
        (data.versions || []).map((item: any) => ({
          id: String(item.id),
          url: String(item.url),
          version: Number(item.version || 0),
          instruction: item.instruction ? String(item.instruction) : null,
        }))
      );
      setMessages((data.messages || []).map((item: any) => ({
        id: String(item.id),
        role: item.role === 'assistant' ? 'assistant' : 'user',
        content: String(item.content || ''),
        metadata: item.metadata || undefined,
      })));
      if (data.current?.url && data.current?.id) {
        setCurrentImageUrl(data.current.url);
        setCurrentGenerationId(data.current.id);
        onImageChange(data.current.url, data.current.id);
      }
    } catch (err: any) {
      setError(err?.message || 'A szerkesztési előzmények nem tölthetők be.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadSessionByGeneration = async (id: string) => {
    if (!id) return;
    try {
      const response = await fetch(`/api/image-edit?generationId=${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (response.status === 404) return;
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'A szerkesztési előzmények nem tölthetők be.');
      const discoveredSessionId = String(data.session?.id || '');
      if (!discoveredSessionId) return;

      setSessionId(discoveredSessionId);
      window.localStorage.setItem(`v3:image-edit-session:${generationId}`, discoveredSessionId);
      setVersions(
        (data.versions || []).map((item: any) => ({
          id: String(item.id),
          url: String(item.url),
          version: Number(item.version || 0),
          instruction: item.instruction ? String(item.instruction) : null,
        }))
      );
      setMessages((data.messages || []).map((item: any) => ({
        id: String(item.id),
        role: item.role === 'assistant' ? 'assistant' : 'user',
        content: String(item.content || ''),
        metadata: item.metadata || undefined,
      })));
      if (data.current?.url && data.current?.id) {
        setCurrentImageUrl(data.current.url);
        setCurrentGenerationId(data.current.id);
        onImageChange(data.current.url, data.current.id);
      }
    } catch (err: any) {
      setError(err?.message || 'A szerkesztési előzmények nem tölthetők be.');
    } finally {
      setLoadingHistory(false);
    }
  };

    const resetReferences = () => setPendingReferences([]);

  const charLabel = (id: string) => characters.find((item) => item.id === id)?.name || id;

  return (
    <div className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-sm p-3 sm:p-6">
      <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-gray-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Képszerkesztő</div>
            <div className="text-sm font-semibold text-white">Beszélj hozzá a képhez</div>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            {versions.length > 0 && (
              <select
                value={currentGenerationId}
                onChange={(event) => {
                  const selected = versions.find((item) => item.id === event.target.value);
                  if (!selected || selected.id === currentGenerationId) return;
                  setError('');
                  setCurrentGenerationId(selected.id);
                  setCurrentImageUrl(selected.url);
                  onImageChange(selected.url, selected.id);
                }}
                disabled={loading || loadingHistory}
                className="max-w-[320px] min-w-0 rounded-lg border border-gray-700 bg-black px-3 py-1.5 text-xs text-gray-200 outline-none hover:border-gray-500 focus:border-gray-500"
                aria-label="Képes verzió kiválasztása"
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.version === 0
                      ? 'V0 · Eredeti kép'
                      : `V${version.version} · ${version.instruction || 'Szerkesztés'}`}
                  </option>
                ))}
              </select>
            )}
            {loadingHistory && <span className="shrink-0 text-xs text-gray-500">Előzmények…</span>}
            <button type="button" onClick={onClose} className="shrink-0 rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-500 hover:text-white">Bezárás</button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-h-0 items-center justify-center overflow-auto border-b border-gray-800 bg-black p-4 lg:border-b-0 lg:border-r">
            <img src={currentImageUrl} alt="Szerkesztett kép" className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" />
          </div>

          <div className="flex min-h-0 flex-col bg-zinc-950">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {versions.length > 0 && (
                <div className="mb-3 text-[10px] uppercase tracking-[0.16em] text-gray-600">
                  V{versions.find((item) => item.id === currentGenerationId)?.version ?? 0} kiválasztva · a következő módosítás ebből a verzióból indul
                </div>
              )}

              {messages.length === 0 && (
                <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-sm text-gray-400">
                  Mondd meg, mit változtassak. A rendszer az aktuális képet tartja alapnak, és csak a kért részt próbálja módosítani.
                  <div className="mt-3 text-xs text-gray-500">Például: „Tüntesd el a háttérben álló figurát.” vagy „Essen az eső, minden más maradjon ugyanígy.”</div>
                </div>
              )}

              <div className="space-y-3">
                {messages.map((message) => (
                  <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div className={message.role === 'user'
                      ? 'max-w-[88%] rounded-2xl rounded-br-md bg-white px-3.5 py-2.5 text-sm text-black'
                      : 'max-w-[88%] rounded-2xl rounded-bl-md border border-gray-800 bg-gray-900 px-3.5 py-2.5 text-sm text-gray-200'}>
                      <div>{message.content}</div>
                      {message.role === 'user' && message.metadata?.addedCharacterIds?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {message.metadata.addedCharacterIds.map((item) => (
                            <span key={item.id} className="rounded-full border border-gray-300/60 px-2 py-0.5 text-[10px]">
                              + {item.name}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {message.role === 'user' && message.metadata?.uploadedReferenceCount ? (
                        <div className="mt-2 text-[10px] opacity-60">+ {message.metadata.uploadedReferenceCount} referencia</div>
                      ) : null}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {loading && (
                <div className="mt-3 text-xs text-gray-500">A Gemini dolgozik…</div>
              )}
            </div>

            <div className="border-t border-gray-800 p-3">
              {selectedCharacterIds.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {selectedCharacterIds.map((id) => (
                    <button key={id} type="button" onClick={() => removeCharacter(id)} className="rounded-full border border-gray-700 bg-gray-900 px-2.5 py-1 text-[11px] text-gray-300">
                      {charLabel(id)} ×
                    </button>
                  ))}
                </div>
              )}

              {pendingReferences.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {pendingReferences.map((item) => (
                    <button key={item.id} type="button" onClick={() => setPendingReferences((current) => current.filter((ref) => ref.id !== item.id))} className="max-w-[180px] truncate rounded-full border border-gray-700 bg-gray-900 px-2.5 py-1 text-[11px] text-gray-300">
                      {item.name} ×
                    </button>
                  ))}
                  <button type="button" onClick={resetReferences} className="px-2 py-1 text-[11px] text-gray-500 hover:text-white">mind töröl</button>
                </div>
              )}

              {showCharacterPicker && (
                <div className="mb-2 max-h-40 overflow-y-auto rounded-xl border border-gray-800 bg-gray-900 p-2">
                  {selectableCharacters.length === 0 ? (
                    <div className="px-2 py-1 text-xs text-gray-500">Nincs további választható karakter.</div>
                  ) : selectableCharacters.map((item) => (
                    <button key={item.id} type="button" onClick={() => addCharacter(item.id)} className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 hover:text-white">
                      {item.name}
                    </button>
                  ))}
                </div>
              )}

              {showReferencePicker && (
                <div className="mb-2 rounded-xl border border-gray-800 bg-gray-900 p-3">
                  <div className="mb-2 text-xs text-gray-500">Adj hozzá 1–4 referencia képet ehhez a körhöz.</div>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full rounded-lg border border-dashed border-gray-700 px-3 py-2 text-sm text-gray-300 hover:border-gray-500 hover:text-white">
                    Képek kiválasztása
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => { if (event.target.files) addReferences(event.target.files); event.currentTarget.value = ''; }}
                  />
                </div>
              )}

              {error && <div className="mb-2 rounded-lg border border-red-900 bg-red-950/30 px-3 py-2 text-xs text-red-300">{error}</div>}

              <form onSubmit={submitEdit} className="space-y-2">
                <textarea
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void submitEdit();
                    }
                  }}
                  rows={3}
                  placeholder="Mit változtassak a képen?"
                  className="w-full resize-none rounded-xl border border-gray-700 bg-gray-900 px-3 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-gray-500"
                  disabled={loading}
                />

                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => { setShowCharacterPicker((value) => !value); setShowReferencePicker(false); }} disabled={loading || selectedCharacterIds.length >= 3} className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300 hover:border-gray-500 hover:text-white disabled:opacity-40">
                    + Karakter
                  </button>
                  <button type="button" onClick={() => { setShowReferencePicker((value) => !value); setShowCharacterPicker(false); }} disabled={loading || pendingReferences.length >= MAX_ATTACHMENTS} className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300 hover:border-gray-500 hover:text-white disabled:opacity-40">
                    + Referencia
                  </button>
                  <button type="submit" disabled={loading || !instruction.trim()} className="ml-auto rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-gray-200 disabled:opacity-40">
                    {loading ? 'Dolgozik…' : 'Küldés · 1 kredit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
