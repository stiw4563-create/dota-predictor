'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TournamentList from '@/components/TournamentList';
import MatchPanel from '@/components/MatchPanel';
import HeroPicker from '@/components/HeroPicker';
import PredictionPanel from '@/components/PredictionPanel';
import PoolInsights from '@/components/PoolInsights';
import LivePredict from '@/components/LivePredict';
import type {
  AnalyzeResponse,
  LiveMatchSummary,
  MatchSummary,
  ODHero,
  Side,
  Tournament,
} from '@/lib/types';

interface TeamOpt {
  id: number;
  name: string;
}

export default function Home() {
  // ─────── State ───────
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  const [activeT, setActiveT] = useState<number | null>(null);
  const [pool, setPool] = useState<Set<number>>(new Set());

  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [teams, setTeams] = useState<TeamOpt[]>([]);
  const [live, setLive] = useState<LiveMatchSummary[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [autoFillFromLive, setAutoFillFromLive] = useState(false);

  const [heroes, setHeroes] = useState<ODHero[]>([]);

  const [teamA, setTeamA] = useState<TeamOpt | null>(null);
  const [teamB, setTeamB] = useState<TeamOpt | null>(null);
  const [sideA, setSideA] = useState<Side>('radiant');
  const [heroesA, setHeroesA] = useState<number[]>(Array(5).fill(0));
  const [heroesB, setHeroesB] = useState<number[]>(Array(5).fill(0));

  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [tournamentsError, setTournamentsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // ─────── Initial fetch ───────
  useEffect(() => {
    let alive = true;
    setTournamentsLoading(true);
    setTournamentsError(null);
    (async () => {
      try {
        const [tRes, hRes] = await Promise.all([
          fetch('/api/tournaments').then(async (r) => {
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
            return j;
          }),
          fetch('/api/heroes').then((r) => r.json()),
        ]);
        if (!alive) return;
        const ts: Tournament[] = tRes.tournaments ?? [];
        setTournaments(ts);
        setPool(new Set(ts.map((t) => t.id)));
        if (ts.length) setActiveT(ts[0].id);
        setHeroes(hRes.heroes ?? []);
      } catch (e) {
        if (!alive) return;
        setTournamentsError((e as Error).message);
        setTournaments([]);
      } finally {
        if (alive) setTournamentsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  // ─────── Load matches for active tournament ───────
  useEffect(() => {
    if (!activeT) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/tournament/${activeT}`).then((r) => r.json());
        if (!alive) return;
        setMatches(res.matches ?? []);
        setTeams(res.teams ?? []);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [activeT]);

  // ─────── Poll live every 20s for the active tournament ───────
  useEffect(() => {
    if (!activeT) return;
    let alive = true;
    const fetchLive = async () => {
      try {
        const res = await fetch(`/api/live?leagueId=${activeT}`).then((r) => r.json());
        if (!alive) return;
        setLive(res.live ?? []);
      } catch {
        /* swallow */
      }
    };
    fetchLive();
    const interval = setInterval(fetchLive, 20000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [activeT]);

  // ─────── Auto-fill from selected live match ───────
  useEffect(() => {
    if (!autoFillFromLive || !selectedMatchId) return;
    const cur = live.find((l) => l.matchId === selectedMatchId);
    if (!cur) return;
    // Update picks live (without overriding manual edits the user made
    // after enabling auto-fill - we only set slots that are empty OR
    // were previously set by auto-fill. For simplicity: replace all).
    const pad = (arr: number[]) => {
      const out = arr.slice(0, 5);
      while (out.length < 5) out.push(0);
      return out;
    };

    // Map radiant/dire from live → A/B according to current sideA
    if (sideA === 'radiant') {
      setHeroesA(pad(cur.radiantPicks));
      setHeroesB(pad(cur.direPicks));
      if (cur.radiantTeamId)
        setTeamA({ id: cur.radiantTeamId, name: cur.radiantName });
      if (cur.direTeamId) setTeamB({ id: cur.direTeamId, name: cur.direName });
    } else {
      setHeroesA(pad(cur.direPicks));
      setHeroesB(pad(cur.radiantPicks));
      if (cur.direTeamId) setTeamA({ id: cur.direTeamId, name: cur.direName });
      if (cur.radiantTeamId)
        setTeamB({ id: cur.radiantTeamId, name: cur.radiantName });
    }
  }, [live, selectedMatchId, autoFillFromLive, sideA]);

  // ─────── Tournament selection handlers ───────
  const togglePool = useCallback((id: number) => {
    setPool((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const pickActive = useCallback((id: number) => {
    setActiveT(id);
    // ensure active is in the pool
    setPool((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // ─────── Match selection handlers ───────
  const pickLive = useCallback(
    (m: LiveMatchSummary) => {
      setSelectedMatchId(m.matchId);
      setAutoFillFromLive(true);
      // A = radiant side by default for live
      setSideA('radiant');
      if (m.radiantTeamId) setTeamA({ id: m.radiantTeamId, name: m.radiantName });
      if (m.direTeamId) setTeamB({ id: m.direTeamId, name: m.direName });
      const pad = (arr: number[]) => {
        const out = arr.slice(0, 5);
        while (out.length < 5) out.push(0);
        return out;
      };
      setHeroesA(pad(m.radiantPicks));
      setHeroesB(pad(m.direPicks));
    },
    []
  );

  const pickPast = useCallback((m: MatchSummary) => {
    setSelectedMatchId(m.matchId);
    setAutoFillFromLive(false);
    setSideA('radiant');
    if (m.radiantTeamId) setTeamA({ id: m.radiantTeamId, name: m.radiantName });
    if (m.direTeamId) setTeamB({ id: m.direTeamId, name: m.direName });
    setHeroesA(Array(5).fill(0));
    setHeroesB(Array(5).fill(0));

    // Fetch the match's actual draft and auto-fill the pickers.
    (async () => {
      try {
        const res = await fetch(`/api/match/${m.matchId}`);
        if (!res.ok) return;
        const d = await res.json();
        if (!d.hasDraft) return;
        const pad = (arr: number[]) =>
          [...arr.slice(0, 5), ...Array(5).fill(0)].slice(0, 5);
        // Match radiant/dire to current A/B assignment (A = radiant here).
        setHeroesA(pad(d.radiantHeroes ?? []));
        setHeroesB(pad(d.direHeroes ?? []));
      } catch {
        /* draft autofill is best-effort */
      }
    })();
  }, []);

  // ─────── Analyze trigger (debounced) ───────
  const runReqId = useRef(0);
  useEffect(() => {
    if (!teamA || !teamB || pool.size === 0) {
      setAnalysis(null);
      return;
    }
    const id = ++runReqId.current;
    setAnalyzing(true);
    setAnalyzeError(null);
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            tournamentIds: [...pool],
            teamAId: teamA.id,
            teamBId: teamB.id,
            sideA,
            heroesA,
            heroesB,
          }),
        });
        if (id !== runReqId.current) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as AnalyzeResponse;
        if (id !== runReqId.current) return;
        setAnalysis(data);
      } catch (e) {
        if (id !== runReqId.current) return;
        setAnalyzeError((e as Error).message);
        setAnalysis(null);
      } finally {
        if (id === runReqId.current) setAnalyzing(false);
      }
    }, 350); // debounce
    return () => clearTimeout(t);
  }, [teamA, teamB, sideA, heroesA, heroesB, pool]);

  // ─────── UI handlers ───────
  const onSwapSide = useCallback(() => {
    setSideA((s) => (s === 'radiant' ? 'dire' : 'radiant'));
  }, []);
  const onSwapTeams = useCallback(() => {
    setTeamA((a) => {
      setTeamB(a);
      return teamB;
    });
    setHeroesA((a) => {
      setHeroesB(a);
      return heroesB;
    });
  }, [teamB, heroesB]);

  // ─────── Render ───────
  const teamOpts = useMemo(() => teams, [teams]);

  return (
    <main className="min-h-screen bg-grid relative">
      <div className="relative z-10">
        {/* Header */}
        <header className="hairline-b">
          <div className="max-w-[1480px] mx-auto px-6 py-5 flex items-baseline justify-between">
            <div>
              <h1 className="font-display text-2xl md:text-3xl uppercase tracking-tight leading-none">
                <span className="text-radiant">DOTA</span>
                <span className="text-ink-100">·</span>
                <span className="text-dire">PROGNOSIS</span>
              </h1>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300 mt-1.5">
                Прогноз live-матчей · Tier 1 пул · OpenDota
              </p>
            </div>
            <div className="hidden md:block text-right">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-300">
                Турниров в пуле
              </div>
              <div className="font-display text-2xl tabular text-radiant">
                {pool.size}
                <span className="text-ink-400 text-base">/{tournaments.length}</span>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-[1480px] mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[280px_1fr_360px] gap-6">
          {/* ───── Left: tournaments ───── */}
          <aside className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xs uppercase tracking-[0.2em] text-ink-200">
                Турниры
              </h2>
              <span className="font-mono text-[10px] text-ink-300 uppercase">
                live + recent
              </span>
            </div>
            <TournamentList
              tournaments={tournaments}
              selected={pool}
              active={activeT}
              onPickActive={pickActive}
              onToggle={togglePool}
              loading={tournamentsLoading}
              error={tournamentsError}
              onRetry={() => setReloadKey((k) => k + 1)}
            />
            <p className="text-[10px] font-mono text-ink-300 leading-relaxed pt-2">
              Чекбокс справа — включить турнир в общий пул статистики.
              Клик по карточке — открыть его матчи.
            </p>
          </aside>

          {/* ───── Middle: matches + hero picker ───── */}
          <section className="space-y-6 min-w-0">
            <MatchPanel
              live={[]}
              recent={matches}
              onPickLive={pickLive}
              onPickPast={pickPast}
              selectedMatchId={selectedMatchId}
            />

            <div className="hairline-t pt-6">
              {/* Manual team override */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <TeamSelect
                  label="Команда A"
                  value={teamA}
                  options={teamOpts}
                  onChange={setTeamA}
                  accent={sideA === 'radiant' ? 'radiant' : 'dire'}
                />
                <TeamSelect
                  label="Команда B"
                  value={teamB}
                  options={teamOpts}
                  onChange={setTeamB}
                  accent={sideA === 'radiant' ? 'dire' : 'radiant'}
                />
              </div>

              <HeroPicker
                heroes={heroes}
                teamAName={teamA?.name ?? ''}
                teamBName={teamB?.name ?? ''}
                sideA={sideA}
                onSwapSide={onSwapSide}
                onSwapTeams={onSwapTeams}
                heroesA={heroesA}
                heroesB={heroesB}
                onChange={(which, list) =>
                  which === 'A' ? setHeroesA(list) : setHeroesB(list)
                }
              />

              {autoFillFromLive && (
                <div className="mt-3 hairline px-3 py-2 bg-ink-850 flex items-center justify-between">
                  <div className="font-mono text-[10px] uppercase text-ink-200">
                    Авто-обновление из live-матча активно. Пики и команды
                    подгружаются автоматически.
                  </div>
                  <button
                    onClick={() => setAutoFillFromLive(false)}
                    className="font-mono text-[10px] uppercase text-dire hover:underline"
                  >
                    отключить
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* ───── Right: prediction ───── */}
          <aside className="space-y-3">
            {/* Live in-game predictions */}
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xs uppercase tracking-[0.2em] text-dire">
                Live · по ходу игры
              </h2>
              <span className="font-mono text-[10px] text-ink-300 uppercase">
                обновление 30с
              </span>
            </div>
            <LivePredict />

            <div className="flex items-baseline justify-between pt-3 hairline-t">
              <h2 className="font-display text-xs uppercase tracking-[0.2em] text-ink-200">
                Прогноз · до игры
              </h2>
              <span className="font-mono text-[10px] text-ink-300 uppercase">
                debounced
              </span>
            </div>
            {analyzeError && (
              <div className="hairline p-3 text-xs text-dire bg-ink-900">
                Ошибка анализа: {analyzeError}
              </div>
            )}
            <PredictionPanel
              data={analysis}
              loading={analyzing}
              teamAName={teamA?.name ?? ''}
              teamBName={teamB?.name ?? ''}
              sideA={sideA}
            />
          </aside>
        </div>

        {/* ───── Pool insights (full width) ───── */}
        {analysis && (
          <div className="max-w-[1480px] mx-auto px-6">
            <PoolInsights
              data={analysis}
              heroes={heroes}
              teamAName={teamA?.name ?? ''}
              teamBName={teamB?.name ?? ''}
            />
          </div>
        )}

        <footer className="hairline-t mt-12">
          <div className="max-w-[1480px] mx-auto px-6 py-4 flex items-center justify-between text-[10px] font-mono uppercase text-ink-300">
            <span>Данные · OpenDota API · 60 req/min free tier</span>
            <span>v0.1 · MVP</span>
          </div>
        </footer>
      </div>
    </main>
  );
}

function TeamSelect({
  label,
  value,
  options,
  onChange,
  accent,
}: {
  label: string;
  value: TeamOpt | null;
  options: TeamOpt[];
  onChange: (t: TeamOpt | null) => void;
  accent: 'radiant' | 'dire';
}) {
  return (
    <label className="block">
      <span
        className={`font-mono text-[10px] uppercase tracking-widest ${
          accent === 'radiant' ? 'text-radiant' : 'text-dire'
        }`}
      >
        {label}
      </span>
      <select
        className="mt-1 w-full hairline bg-ink-900 px-3 py-2 font-display text-sm uppercase appearance-none focus:outline-none"
        value={value?.id ?? ''}
        onChange={(e) => {
          const id = Number(e.target.value);
          const opt = options.find((t) => t.id === id) ?? null;
          onChange(opt);
        }}
      >
        <option value="">— выбрать —</option>
        {options.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
