'use client';

import type { Tournament } from '@/lib/types';

interface Props {
  tournaments: Tournament[];
  selected: Set<number>;
  active: number | null;
  onPickActive: (id: number) => void;
  onToggle: (id: number) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export default function TournamentList({
  tournaments,
  selected,
  active,
  onPickActive,
  onToggle,
  loading,
  error,
  onRetry,
}: Props) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-16 hairline bg-ink-900 animate-pulse-soft"
          />
        ))}
      </div>
    );
  }
  if (!tournaments.length) {
    return (
      <div className="hairline p-4 bg-ink-900 space-y-3">
        <div className="font-mono text-xs text-ink-200">
          Турниры не загружены.
        </div>
        {error && (
          <div className="font-mono text-[10px] text-dire break-words">
            {error}
          </div>
        )}
        <div className="font-mono text-[10px] text-ink-300 leading-relaxed">
          Возможные причины: OpenDota недоступен, лимит 60 req/min исчерпан, или нет
          активных Tier-1 турниров. Подожди минуту и попробуй снова.
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="hairline px-3 py-1.5 font-mono text-[10px] uppercase bg-ink-850 hover:bg-ink-800"
          >
            ↻ повторить
          </button>
        )}
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {tournaments.map((t) => {
        const isActive = active === t.id;
        const inPool = selected.has(t.id);
        return (
          <li key={t.id}>
            <div
              className={`group hairline relative transition-colors ${
                isActive ? 'bg-ink-800 border-radiant/50' : 'bg-ink-900 hover:bg-ink-850'
              }`}
            >
              <button
                onClick={() => onPickActive(t.id)}
                className="block w-full text-left p-3 pr-12"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1 inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                      t.status === 'live'
                        ? 'bg-dire animate-pulse-soft'
                        : 'bg-ink-500'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-[13px] leading-tight uppercase tracking-wide break-words line-clamp-2" title={t.name}>
                      {t.name}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] font-mono uppercase text-ink-300">
                      <span
                        className={
                          t.tier === 'premium' ? 'text-radiant' : 'text-ink-300'
                        }
                      >
                        {t.tier === 'premium' ? 'Tier 1' : t.tier}
                      </span>
                      <span>·</span>
                      <span className="tabular">{t.matchCount} матчей</span>
                      {t.status === 'live' && (
                        <>
                          <span>·</span>
                          <span className="text-dire">LIVE</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </button>
              <label
                title="Включить в пул статистики"
                className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer p-2"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={inPool}
                  onChange={() => onToggle(t.id)}
                />
                <span
                  className={`block h-4 w-4 border ${
                    inPool
                      ? 'bg-radiant border-radiant'
                      : 'border-ink-500 bg-transparent group-hover:border-ink-300'
                  }`}
                />
              </label>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
