"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Character } from '../types';

type Account = {
  authenticated: boolean;
  user?: { id: string; email?: string };
  plan?: 'free' | 'paid' | 'admin';
  generationCredits?: number;
  characterSlots?: number;
};

export default function HomePage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/me')
      .then((res) => res.json())
      .then((data) => setAccount(data))
      .catch(() => setAccount({ authenticated: false }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!account?.authenticated) return;
    fetch('/api/characters')
      .then((res) => (res.ok ? res.json() : []))
      .then(setCharacters)
      .catch(() => setCharacters([]));
  }, [account?.authenticated]);

  const handleDelete = async (character: Character) => {
    if (!window.confirm(`Biztosan törlöd ezt a karaktert?\n\n${character.name}`)) return;
    setDeletingId(character.id);
    try {
      const response = await fetch('/api/characters', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: character.id }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || 'A karakter törlése sikertelen.');
      }
      setCharacters((current) => current.filter((item) => item.id !== character.id));
    } catch (error: any) {
      window.alert(error?.message || 'A karakter törlése sikertelen.');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <main className="min-h-screen bg-black text-zinc-100 font-mono p-8">ffffffffffffffffff…</main>;
  }

  if (!account?.authenticated) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-black text-zinc-100">
        <div className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="pointer-events-none absolute -right-40 top-16 h-96 w-96 rounded-full border border-zinc-800/70" />
        <div className="pointer-events-none absolute -left-56 bottom-0 h-[30rem] w-[30rem] rounded-full border border-zinc-900" />

        <div className="relative mx-auto flex min-h-[calc(100vh-65px)] w-full max-w-6xl items-center px-4 md:px-0 py-16">
          <div className="grid w-full items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            <section>
              <div className="mb-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-600">
                <span>VALLALHATATLAN</span>
                <span>VALÓSÁG MOTOR / V3</span>
                <span className="text-zinc-800">///</span>
              </div>

              <h1 className="max-w-3xl text-5xl font-extrabold leading-[0.95] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
                Karakter be.
                <br />
                <span className="text-zinc-400">Valóság ki.</span>
              </h1>

              <p className="mt-7 max-w-xl text-base leading-7 text-zinc-400 sm:text-lg">
                Bedobsz egy karaktert. Akár magadat is. Adsz neki egy helyet, egy kamerát és egy stílust. Aztán generálunk egy valóságot, amit utólag nehéz megmagyarázni.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/auth" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-bold text-black transition hover:bg-zinc-200">
                  Belépés / regisztráció
                </Link>
                <span className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-xs text-zinc-500">
                  3 ingyenes generálás
                </span>
              </div>

              <div className="mt-11 grid max-w-xl gap-3 sm:grid-cols-3">
                {[
                  ['01', 'Karakterhű', 'Referenciaképekből építkezik'],
                  ['02', 'Analóg', 'Noir, VHS és visszafogott színek'],
                  ['03', 'Kontroll', 'Kamera, helyszín, stílus'],
                ].map(([number, title, text]) => (
                  <div key={number} className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
                    <div className="text-[10px] tracking-[0.25em] text-zinc-600">{number}</div>
                    <div className="mt-3 text-sm font-bold text-zinc-100">{title}</div>
                    <div className="mt-1 text-xs leading-5 text-zinc-500">{text}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="relative">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 shadow-2xl">
                <div className="rounded-xl border border-zinc-800 bg-black p-4">
                  <div className="mb-4 flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-zinc-600">
                    <span>VALÓSÁG MOTOR</span>
                    <span>V3.1</span>
                  </div>

                  <div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-zinc-900 bg-black">
                    <img
                      src="/malac.jpg"
                      alt="Vállalhatatlan / Valóság Motor"
                      className="absolute inset-0 h-full w-full object-cover object-center"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/20" />
                    <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)', backgroundSize: '100% 10px' }} />
                    <div className="absolute left-5 top-5 text-[9px] tracking-[0.2em] text-zinc-300/70">CHARACTER / V</div>
                    <div className="absolute bottom-5 left-5 right-5">
                      <div className="text-xs uppercase tracking-[0.2em] text-zinc-300/60">VALÓSÁG MOTOR</div>
                      <div className="mt-1 text-sm font-semibold text-white">VÁLLALHATATLAN // VALÓSÁG MOTOR</div>
                      <div className="mt-3 h-px bg-white/20" />
                      <div className="mt-3 text-[10px] leading-5 text-zinc-200/60">
                        KARAKTER • JELENET • STÍLUS • KAMERA
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    );
  }

  const isPaid = account.plan === 'paid' || account.plan === 'admin';
  const systemCharacters = characters.filter((character: any) => character.type === 'system');
  const ownCharacters = characters.filter((character: any) => character.type !== 'system');

  return (
    <main className="min-h-screen bg-black text-zinc-100 font-mono flex flex-col items-center max-w-7xl mx-auto px-6 mt-6">
      <div className="w-full max-w-6xl">
        <div className="flex flex-col md:flex-row md:justify-between md:items-end mb-8 gap-4">
          <div>
            <div className="text-xs tracking-[0.25em] text-zinc-500 mb-2">IMAGE GENERATOR</div>
            <h1 className="text-3xl font-bold tracking-tight">Karakterek</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-full border border-zinc-800 px-3 py-1.5 text-zinc-300">{account.generationCredits ?? 0} kredit</span>
            <span className="rounded-full border border-zinc-800 px-3 py-1.5 text-zinc-500">{isPaid ? 'PAID' : 'FREE'}</span>
            {isPaid && <Link href="/character/new" className="rounded-lg bg-white px-4 py-2 font-semibold text-black hover:bg-zinc-200">+ Saját karakter</Link>}
          </div>
        </div>

        <section>
          <h2 className="text-sm uppercase tracking-widest text-zinc-500 mb-4">Alapkarakterek</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {systemCharacters.map((char) => (
              <Link key={char.id} href={`/character/${char.id}`} className="bg-zinc-900 rounded-lg p-4 border border-zinc-800 hover:border-zinc-600 transition">
                <div className="font-bold text-lg">{char.name}</div>
                <div className="text-gray-400 text-sm mt-1 line-clamp-2">{char.description}</div>
                <div className="mt-4 text-xs text-zinc-500">Kép generálása →</div>
              </Link>
            ))}
          </div>
        </section>

        {isPaid && ownCharacters.length > 0 && (
          <section className="mt-10">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm uppercase tracking-widest text-zinc-500">Saját karakterek</h2>
              <span className="text-xs text-zinc-600">{account.characterSlots ?? 0} hely maradt</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {ownCharacters.map((char) => (
                <div key={char.id} className="bg-zinc-900 rounded-lg p-4 border border-gray-800 flex flex-col">
                  <Link href={`/character/${char.id}`} className="block">
                    <div className="font-bold text-lg">{char.name}</div>
                    <div className="text-gray-400 text-sm line-clamp-2">{char.description}</div>
                    <div className="mt-2 text-xs text-gray-500">{char.traits.join(', ')}</div>
                  </Link>
                  <div className="mt-4 flex justify-end">
                    <button type="button" onClick={() => handleDelete(char)} disabled={deletingId === char.id} className="rounded border border-gray-700 px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 transition disabled:opacity-50">
                      {deletingId === char.id ? 'Törlés...' : 'Karakter törlése'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!isPaid && (
          <div className="mt-10 rounded-xl border border-zinc-800 bg-zinc-950 p-5 text-sm text-zinc-400">
            A FREE hozzáférés 6 képgenerálást tartalmaz. Saját karakterekhez és haladó generálási eszközökhöz kreditvásárlás szükséges.
          </div>
        )}
      </div>
    </main>
  );
}
