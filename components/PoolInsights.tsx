'use client';

import type { AnalyzeResponse, ODHero } from '@/lib/types';
import { heroPortrait, heroById } from '@/lib/heroImages';

interface Props {
  data: AnalyzeResponse | null;
  heroes: ODHero[];
  teamAName: string;
  teamBName: string;
}

function pct(x: number, digits = 0) {
  return `${(x * 100).toFixed(digits)}%`;
}

function HeroChip({
  heroes,
  heroId,
  label,
  sub,
  tone = 'neutral',
}: {
  heroes: ODHero[];
  heroId: number;
  label: string;
  sub?: string;
  tone?: 'radiant' | 'dire' | 'neutral';
}) {
  const h = heroById(heroes, heroId);
  const toneClass =
    tone === 'radiant'
      ? 'border-radiant/40'
      : tone === 'dire'
        ? 'border-dire/40'
        : 'border-ink-500';
  return (
    <div
      className={`relative aspect-[5/3] hairline ${toneClass} bg-ink-900 overflow-hidden`}
      title={h?.localized_name}
    >
      {h && (
        <img
          src={heroPortrait(h)}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-80"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-ink-950/95 via-ink-950/35 to-transparent" />
      <div className="relative h-full flex flex-col justify-end px-1.5 py-1">
        <div className="font-display text-[9px] uppercase truncate leading-tight text-ink-50">
          {h?.localized_name ?? `#${heroId}`}
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <span className="font-mono text-[8px] text-ink-300 uppercase truncate">{sub ?? ''}</span>
          <span
            className={`font-mono text-[10px] tabular ${
              tone === 'radiant'
                ? 'text-radiant'
                : tone === 'dire'
                  ? 'text-dire'
                  : 'text-ink-100'
            }`}
          >
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function PoolInsights({ data, heroes, teamAName, teamBName }: Props) {
  if (!data) return null;
  const {
    topHeroesRadiant,
    topHeroesDire,
    mostBanned,
    playerHeroFitA,
    playerHeroFitB,
    counterPicksForA,
    counterPicksForB,
    teamAStats,
    teamBStats,
  } = data;

  const showRoster = (team: typeof teamAStats) => {
    if (!team || team.aliases.length === 0) return null;
    return (
      <div className="font-mono text-[10px] text-ink-300 mt-0.5">
        aka {team.aliases.slice(0, 2).join(' / ')}
      </div>
    );
  };

  return (
    <section className="space-y-6 hairline-t pt-6 mt-6">
      <div>
        <h2 className="font-display text-xs uppercase tracking-[0.2em] text-ink-200 mb-3">
          Статистика пула
        </h2>

        {/* Team identity / aliases */}
        {(teamAStats?.aliases.length || teamBStats?.aliases.length) ? (
          <div className="hairline p-3 bg-ink-900 mb-4">
            <div className="font-mono text-[10px] uppercase text-ink-300 mb-2">
              Альтернативные названия (по составу)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {teamAStats && (
                <div>
                  <span className="font-display uppercase">{teamAStats.name}</span>
                  {showRoster(teamAStats)}
                </div>
              )}
              {teamBStats && (
                <div>
                  <span className="font-display uppercase">{teamBStats.name}</span>
                  {showRoster(teamBStats)}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Top heroes per side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="font-display text-xs uppercase tracking-[0.2em] text-radiant mb-2">
            ТОП ГЕРОЕВ · СВЕТ
          </h3>
          <div className="grid grid-cols-4 gap-1.5">
            {topHeroesRadiant.map((t) => (
              <HeroChip
                key={t.heroId}
                heroes={heroes}
                heroId={t.heroId}
                label={pct(t.winrate)}
                sub={`${t.games}и`}
                tone="radiant"
              />
            ))}
          </div>
        </div>
        <div>
          <h3 className="font-display text-xs uppercase tracking-[0.2em] text-dire mb-2">
            ТОП ГЕРОЕВ · ТЬМА
          </h3>
          <div className="grid grid-cols-4 gap-1.5">
            {topHeroesDire.map((t) => (
              <HeroChip
                key={t.heroId}
                heroes={heroes}
                heroId={t.heroId}
                label={pct(t.winrate)}
                sub={`${t.games}и`}
                tone="dire"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Most banned */}
      {mostBanned.length > 0 && (
        <div>
          <h3 className="font-display text-xs uppercase tracking-[0.2em] text-ink-200 mb-2">
            Чаще всего банят
          </h3>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-1.5">
            {mostBanned.map((b) => (
              <HeroChip
                key={b.heroId}
                heroes={heroes}
                heroId={b.heroId}
                label={`×${b.bans}`}
                sub="бан"
              />
            ))}
          </div>
        </div>
      )}

      {/* Counter-picks */}
      {(counterPicksForA.length > 0 || counterPicksForB.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {counterPicksForA.length > 0 && (
            <div>
              <h3 className="font-display text-xs uppercase tracking-[0.2em] text-radiant mb-2">
                {teamAName || 'A'} · vs B
              </h3>
              <div className="grid grid-cols-5 gap-1.5">
                {counterPicksForA.map((c) => (
                  <HeroChip
                    key={c.heroId}
                    heroes={heroes}
                    heroId={c.heroId}
                    label={c.sampleSize > 0 ? pct(c.winrateAgainst) : '—'}
                    sub={c.sampleSize > 0 ? `n=${c.sampleSize}` : 'нет данных'}
                    tone="radiant"
                  />
                ))}
              </div>
            </div>
          )}
          {counterPicksForB.length > 0 && (
            <div>
              <h3 className="font-display text-xs uppercase tracking-[0.2em] text-dire mb-2">
                {teamBName || 'B'} · vs A
              </h3>
              <div className="grid grid-cols-5 gap-1.5">
                {counterPicksForB.map((c) => (
                  <HeroChip
                    key={c.heroId}
                    heroes={heroes}
                    heroId={c.heroId}
                    label={c.sampleSize > 0 ? pct(c.winrateAgainst) : '—'}
                    sub={c.sampleSize > 0 ? `n=${c.sampleSize}` : 'нет данных'}
                    tone="dire"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Player-on-hero fit */}
      {(playerHeroFitA.length > 0 || playerHeroFitB.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[{ rows: playerHeroFitA, name: teamAName || 'A', tone: 'radiant' as const },
            { rows: playerHeroFitB, name: teamBName || 'B', tone: 'dire' as const }]
            .map(({ rows, name, tone }) => (
              rows.length > 0 && (
                <div key={name}>
                  <h3 className={`font-display text-xs uppercase tracking-[0.2em] mb-2 ${tone === 'radiant' ? 'text-radiant' : 'text-dire'}`}>
                    {name} · игрок на герое
                  </h3>
                  <ul className="space-y-1">
                    {rows.map((r, i) => {
                      const h = heroById(heroes, r.heroId);
                      return (
                        <li key={`${r.accountId}-${r.heroId}-${i}`} className="hairline px-2 py-1.5 bg-ink-900 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-[10px] text-ink-300 truncate">{r.name}</span>
                            <span className="font-mono text-[10px] text-ink-400">·</span>
                            <span className="font-display text-[11px] uppercase truncate">{h?.localized_name ?? `#${r.heroId}`}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-[10px] text-ink-300">{r.games}и</span>
                            <span className={`font-mono text-xs tabular ${tone === 'radiant' ? 'text-radiant' : 'text-dire'}`}>
                              {pct(r.winrate)}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )
            ))}
        </div>
      )}
    </section>
  );
}
