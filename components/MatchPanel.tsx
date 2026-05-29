'use client';

import type { LiveMatchSummary, MatchSummary } from '@/lib/types';

interface Props {
  live: LiveMatchSummary[];
  recent: MatchSummary[];
  onPickLive: (m: LiveMatchSummary) => void;
  onPickPast: (m: MatchSummary) => void;
  selectedMatchId: number | null;
}

function fmtDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
  });
}

export default function MatchPanel({
  live,
  recent,
  onPickLive,
  onPickPast,
  selectedMatchId,
}: Props) {
  return (
    <div className="space-y-5">
      {live.length > 0 && (
        <section>
          <div className="flex items-baseline gap-3 mb-2">
            <h3 className="font-display text-xs uppercase tracking-[0.2em] text-dire">
              ● Идут сейчас
            </h3>
            <span className="font-mono text-[10px] text-ink-300">{live.length}</span>
          </div>
          <ul className="space-y-1.5">
            {live.map((m) => (
              <li key={m.matchId}>
                <button
                  onClick={() => onPickLive(m)}
                  className={`w-full hairline p-3 text-left transition-colors ${
                    selectedMatchId === m.matchId
                      ? 'bg-ink-800 border-radiant/60'
                      : 'bg-ink-900 hover:bg-ink-850'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
                      <span className="font-display text-sm uppercase truncate text-radiant">
                        {m.radiantName}
                      </span>
                      <span className="font-mono text-xs text-ink-300 tabular">
                        {m.radiantScore} : {m.direScore}
                      </span>
                      <span className="font-display text-sm uppercase truncate text-dire text-right">
                        {m.direName}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] font-mono uppercase text-ink-300">
                    <span>
                      пики: {m.radiantPicks.length}/5 · {m.direPicks.length}/5
                    </span>
                    <span className="text-dire">
                      LIVE · {Math.floor(m.gameTime / 60)}:
                      {String(m.gameTime % 60).padStart(2, '0')}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="flex items-baseline gap-3 mb-2">
          <h3 className="font-display text-xs uppercase tracking-[0.2em] text-ink-200">
            Сыгранные матчи
          </h3>
          <span className="font-mono text-[10px] text-ink-300">{recent.length}</span>
        </div>
        {recent.length === 0 ? (
          <div className="hairline p-4 text-ink-300 font-mono text-xs">
            Нет завершённых матчей.
          </div>
        ) : (
          <ul className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
            {recent.map((m) => {
              const winnerLeft = m.radiantWin;
              return (
                <li key={m.matchId}>
                  <button
                    onClick={() => onPickPast(m)}
                    className={`w-full hairline px-3 py-2 text-left transition-colors ${
                      selectedMatchId === m.matchId
                        ? 'bg-ink-800 border-radiant/60'
                        : 'bg-ink-900 hover:bg-ink-850'
                    }`}
                  >
                    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-sm">
                      <span
                        className={`truncate ${
                          winnerLeft ? 'text-radiant font-medium' : 'text-ink-200'
                        }`}
                      >
                        {m.radiantName}
                      </span>
                      <span className="font-mono text-[10px] text-ink-300 tabular">
                        {fmtDate(m.startTime)}
                      </span>
                      <span
                        className={`truncate text-right ${
                          !winnerLeft ? 'text-dire font-medium' : 'text-ink-200'
                        }`}
                      >
                        {m.direName}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
