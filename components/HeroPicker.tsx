'use client';

import { useMemo, useState } from 'react';
import type { ODHero, Side } from '@/lib/types';
import { heroPortrait } from '@/lib/heroImages';

interface Props {
  heroes: ODHero[];
  teamAName: string;
  teamBName: string;
  sideA: Side;
  onSwapSide: () => void;
  onSwapTeams: () => void;
  heroesA: number[];
  heroesB: number[];
  onChange: (which: 'A' | 'B', list: number[]) => void;
}

const ATTR_COLOR: Record<string, string> = {
  str: 'border-l-2 border-l-red-500/70',
  agi: 'border-l-2 border-l-emerald-500/70',
  int: 'border-l-2 border-l-sky-500/70',
  all: 'border-l-2 border-l-fuchsia-500/70',
};

export default function HeroPicker({
  heroes,
  teamAName,
  teamBName,
  sideA,
  onSwapSide,
  onSwapTeams,
  heroesA,
  heroesB,
  onChange,
}: Props) {
  const [open, setOpen] = useState<null | { which: 'A' | 'B'; slot: number }>(null);
  const [query, setQuery] = useState('');

  const sortedHeroes = useMemo(
    () => [...heroes].sort((a, b) => a.localized_name.localeCompare(b.localized_name)),
    [heroes]
  );
  const filtered = useMemo(() => {
    if (!query.trim()) return sortedHeroes;
    const q = query.toLowerCase();
    return sortedHeroes.filter((h) => h.localized_name.toLowerCase().includes(q));
  }, [sortedHeroes, query]);

  const setSlot = (which: 'A' | 'B', slot: number, heroId: number) => {
    const cur = which === 'A' ? [...heroesA] : [...heroesB];
    while (cur.length < 5) cur.push(0);
    cur[slot] = heroId;
    onChange(which, cur);
    setOpen(null);
    setQuery('');
  };

  const clearSlot = (which: 'A' | 'B', slot: number) => {
    const cur = which === 'A' ? [...heroesA] : [...heroesB];
    cur[slot] = 0;
    onChange(which, cur);
  };

  const heroById = (id: number) => heroes.find((h) => h.id === id);

  const renderSlot = (which: 'A' | 'B', slot: number) => {
    const list = which === 'A' ? heroesA : heroesB;
    const id = list[slot] ?? 0;
    const h = id ? heroById(id) : null;
    const sideClass =
      which === 'A'
        ? sideA === 'radiant'
          ? 'border-radiant/40 hover:border-radiant'
          : 'border-dire/40 hover:border-dire'
        : sideA === 'radiant'
          ? 'border-dire/40 hover:border-dire'
          : 'border-radiant/40 hover:border-radiant';
    return (
      <button
        key={slot}
        onClick={() => setOpen({ which, slot })}
        className={`group relative aspect-[5/4] w-full border ${sideClass} bg-ink-900 text-left transition-colors overflow-hidden`}
      >
        {h ? (
          <>
            {/* Portrait fill */}
            <img
              src={heroPortrait(h)}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-90"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950/95 via-ink-950/40 to-transparent" />
            <div className={`relative h-full flex flex-col justify-end px-2 py-1.5 ${ATTR_COLOR[h.primary_attr] ?? ''}`}>
              <div className="font-display text-[10px] uppercase leading-tight tracking-wide text-ink-50 drop-shadow-lg">
                {h.localized_name}
              </div>
              <div className="font-mono text-[8px] uppercase text-ink-200 drop-shadow">
                {h.primary_attr.toUpperCase()} · {h.attack_type === 'Melee' ? 'ML' : 'RG'}
              </div>
            </div>
            <span
              onClick={(e) => {
                e.stopPropagation();
                clearSlot(which, slot);
              }}
              className="absolute top-0.5 right-1 px-1 font-mono text-[10px] text-ink-100 bg-ink-950/70 opacity-0 group-hover:opacity-100 hover:text-dire"
              role="button"
            >
              ×
            </span>
          </>
        ) : (
          <div className="h-full flex items-center justify-center font-mono text-xs text-ink-400">
            + слот {slot + 1}
          </div>
        )}
      </button>
    );
  };

  const teamSideLabel = (which: 'A' | 'B') => {
    const side = which === 'A' ? sideA : sideA === 'radiant' ? 'dire' : 'radiant';
    return side === 'radiant' ? 'Свет' : 'Тьма';
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 mb-4 items-center">
        {/* Team A */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span
              className={`font-display text-xs uppercase tracking-[0.15em] ${
                sideA === 'radiant' ? 'text-radiant' : 'text-dire'
              }`}
            >
              {teamSideLabel('A')} · A
            </span>
            <span className="font-mono text-[10px] text-ink-300 uppercase">
              {heroesA.filter(Boolean).length}/5
            </span>
          </div>
          <div className="hairline bg-ink-900 px-3 py-2 font-display text-sm uppercase truncate">
            {teamAName || '—'}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => renderSlot('A', i))}
          </div>
        </div>

        {/* Swap controls */}
        <div className="flex md:flex-col items-center justify-center gap-2 py-2">
          <button
            onClick={onSwapSide}
            className="hairline bg-ink-850 hover:bg-ink-800 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest"
            title="Поменять сторону"
          >
            ↔ сторона
          </button>
          <button
            onClick={onSwapTeams}
            className="hairline bg-ink-850 hover:bg-ink-800 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest"
            title="Поменять команды местами"
          >
            ⇋ команды
          </button>
        </div>

        {/* Team B */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span
              className={`font-display text-xs uppercase tracking-[0.15em] ${
                sideA === 'radiant' ? 'text-dire' : 'text-radiant'
              }`}
            >
              B · {teamSideLabel('B')}
            </span>
            <span className="font-mono text-[10px] text-ink-300 uppercase">
              {heroesB.filter(Boolean).length}/5
            </span>
          </div>
          <div className="hairline bg-ink-900 px-3 py-2 font-display text-sm uppercase truncate">
            {teamBName || '—'}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => renderSlot('B', i))}
          </div>
        </div>
      </div>

      {/* Hero picker modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink-950/85 backdrop-blur-sm flex items-start justify-center p-6 overflow-y-auto"
          onClick={() => setOpen(null)}
        >
          <div
            className="hairline bg-ink-900 w-full max-w-3xl mt-12 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 hairline-b">
              <div className="flex items-center justify-between mb-3">
                <div className="font-display text-sm uppercase tracking-wider">
                  Выбор героя · {open.which === 'A' ? teamAName : teamBName} ·{' '}
                  слот {open.slot + 1}
                </div>
                <button
                  onClick={() => setOpen(null)}
                  className="font-mono text-xs text-ink-300 hover:text-radiant"
                >
                  ESC
                </button>
              </div>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск героя…"
                className="w-full bg-ink-850 hairline px-3 py-2 font-mono text-sm placeholder-ink-400 focus:outline-none"
              />
            </div>
            <div className="p-3 grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-1.5 max-h-[60vh] overflow-y-auto">
              {filtered.map((h) => {
                const alreadyPicked =
                  heroesA.includes(h.id) || heroesB.includes(h.id);
                return (
                  <button
                    key={h.id}
                    disabled={alreadyPicked}
                    onClick={() => setSlot(open.which, open.slot, h.id)}
                    className={`relative hairline ${ATTR_COLOR[h.primary_attr] ?? ''} bg-ink-850 text-left transition-colors overflow-hidden aspect-[5/3] ${
                      alreadyPicked
                        ? 'opacity-30 cursor-not-allowed'
                        : 'hover:bg-ink-800 hover:border-radiant/60'
                    }`}
                  >
                    <img
                      src={heroPortrait(h)}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover opacity-80"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-ink-950/95 via-ink-950/30 to-transparent" />
                    <div className="relative h-full flex flex-col justify-end px-2 py-1.5">
                      <div className="font-display text-[10px] uppercase truncate leading-tight text-ink-50 drop-shadow">
                        {h.localized_name}
                      </div>
                      <div className="font-mono text-[8px] uppercase text-ink-200 mt-0.5">
                        {h.primary_attr.toUpperCase()}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
