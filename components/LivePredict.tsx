'use client';

import { useState, useEffect } from 'react';

interface LiveMatch {
  matchId: string | number;
  leagueName?: string | null;
  radiantTeam: string;
  direTeam: string;
  radiantScore: number;
  direScore: number;
  gameTimeSec: number;
  phase: 'draft' | 'live';
  prediction: {
    probRadiant: number;
    probDire: number;
    netLead: number;
    minute: number;
    confidence: 'high' | 'medium' | 'low';
    note: string;
  } | null;
}

function fmtTime(sec: number) {
  const m = Math.floor(Math.abs(sec) / 60);
  const s = Math.abs(sec) % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtLead(n: number) {
  const k = n / 1000;
  const sign = n >= 0 ? '+' : '';
  return `${sign}${k.toFixed(1)}k`;
}

export default function LivePredict() {
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/live-predict');
        const data = await res.json();
        if (!alive) return;
        if (data.error) setError(data.error);
        else {
          setMatches(data.matches ?? []);
          setError(null);
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    // Live data — refresh every 30s.
    const iv = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  if (loading) {
    return (
      <div className="hairline p-4 bg-ink-900 animate-pulse-soft font-mono text-xs text-ink-300">
        Загрузка live-матчей…
      </div>
    );
  }

  if (error || matches.length === 0) {
    return (
      <div className="hairline p-4 bg-ink-900 font-mono text-xs text-ink-300">
        {error
          ? `Не удалось загрузить live: ${error}`
          : 'Сейчас нет идущих про-матчей. Live-прогноз появится во время игр.'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {matches.map((m) => {
        // ── Draft phase: game hasn't started, no probability yet ──
        if (m.phase === 'draft' || !m.prediction) {
          return (
            <div key={String(m.matchId)} className="hairline bg-ink-900 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-ink-300 animate-pulse shrink-0" />
                  <span className="font-mono text-[10px] uppercase text-ink-200 tracking-wider shrink-0">
                    ДРАФТ
                  </span>
                  {m.leagueName && (
                    <span className="font-mono text-[10px] text-ink-300 truncate">
                      · {m.leagueName}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="font-display text-sm uppercase truncate text-radiant flex-1">
                  {m.radiantTeam}
                </div>
                <div className="font-mono text-[10px] text-ink-300 shrink-0">vs</div>
                <div className="font-display text-sm uppercase truncate text-dire flex-1 text-right">
                  {m.direTeam}
                </div>
              </div>
              <div className="mt-2 font-mono text-[10px] text-ink-300">
                Идёт драфт — игра ещё не началась.
              </div>
            </div>
          );
        }

        // ── Live phase ──
        const pr = m.prediction;
        const confColor =
          pr.confidence === 'high'
            ? 'text-radiant'
            : pr.confidence === 'medium'
              ? 'text-ink-100'
              : 'text-dire';
        return (
          <div key={String(m.matchId)} className="hairline bg-ink-900 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-dire animate-pulse shrink-0" />
                <span className="font-mono text-[10px] uppercase text-dire tracking-wider shrink-0">
                  LIVE · {fmtTime(m.gameTimeSec)}
                </span>
                {m.leagueName && (
                  <span className="font-mono text-[10px] text-ink-300 truncate">
                    · {m.leagueName}
                  </span>
                )}
              </div>
              <span className="font-mono text-[10px] text-ink-300 shrink-0">
                нетворс {fmtLead(pr.netLead)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-display text-sm uppercase truncate text-radiant">
                  {m.radiantTeam}
                </div>
                <div className="font-mono text-2xl tabular text-radiant">
                  {(pr.probRadiant * 100).toFixed(0)}%
                </div>
              </div>
              <div className="font-mono text-sm text-ink-200 tabular shrink-0">
                {m.radiantScore} : {m.direScore}
              </div>
              <div className="min-w-0 flex-1 text-right">
                <div className="font-display text-sm uppercase truncate text-dire">
                  {m.direTeam}
                </div>
                <div className="font-mono text-2xl tabular text-dire">
                  {(pr.probDire * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            <div className="h-1.5 hairline bg-ink-950 flex mt-2">
              <div className="bg-radiant" style={{ width: `${pr.probRadiant * 100}%` }} />
              <div className="bg-dire" style={{ width: `${pr.probDire * 100}%` }} />
            </div>

            <div className={`mt-2 font-mono text-[10px] ${confColor}`}>
              {pr.note}
            </div>
          </div>
        );
      })}
    </div>
  );
}
