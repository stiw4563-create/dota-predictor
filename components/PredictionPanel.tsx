'use client';

import type { AnalyzeResponse, Side } from '@/lib/types';

interface Props {
  data: AnalyzeResponse | null;
  loading: boolean;
  teamAName: string;
  teamBName: string;
  sideA: Side;
}

const FACTOR_LABELS: Record<string, string> = {
  elo: 'Elo / класс',
  form: 'Форма',
  h2h: 'Личные встречи',
  draft: 'Сила драфта',
  heroFit: 'Игрок на герое',
  side: 'Преимущество стороны',
};

const FACTOR_EXPLAIN: Record<string, string> = {
  elo: 'Разница рейтинга по всем матчам пула, нормированная на 400 пунктов.',
  form: 'Свежий винрейт с экспоненциальным затуханием (последние матчи весомее).',
  h2h: 'История очных встреч в пуле, сжата tanh-функцией для маленьких выборок.',
  draft: 'Сумма винрейтов выбранных героев на их стороне в пуле, минус 0.5.',
  heroFit: 'Резерв для статистики «игрок-на-герое». В MVP равен нулю.',
  side: 'Винрейт стороны Свет/Тьма по пулу — характеристика текущего патча.',
};

function fmtPct(x: number, digits = 1) {
  return `${(x * 100).toFixed(digits)}%`;
}

// Logit contributions are in nat-log space, not probabilities. Show them as
// signed numbers with 2 decimals. A factor of +1 ≈ 73% confidence, +2 ≈ 88%.
function fmtSigned(x: number) {
  const v = x.toFixed(2);
  return x >= 0 ? `+${v}` : v;
}

export default function PredictionPanel({
  data,
  loading,
  teamAName,
  teamBName,
  sideA,
}: Props) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 hairline bg-ink-900 animate-pulse-soft" />
        ))}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="hairline p-6 text-ink-300 text-sm">
        Выбери команды и пики, чтобы получить прогноз. Минимум — две команды.
        Чем больше пиков задано, тем точнее оценка драфта.
      </div>
    );
  }

  const { prediction, teamAStats, teamBStats, h2h, poolRadiantWR, poolGameCount } = data;
  const probA = prediction.probA;
  const probB = prediction.probB;
  const aWide = probA >= 0.5;
  const contributions = prediction.contributions;

  // Sort factors by absolute contribution magnitude for visual hierarchy
  const factors = Object.entries(contributions).sort(
    ([, a], [, b]) => Math.abs(b) - Math.abs(a)
  );
  const maxAbs = Math.max(0.01, ...factors.map(([, v]) => Math.abs(v)));

  return (
    <div className="space-y-6">
      {/* Probability split */}
      <div>
        <div className="grid grid-cols-2 gap-0 items-end mb-3">
          <div className={aWide ? 'opacity-100' : 'opacity-50'}>
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-300">
              {sideA === 'radiant' ? 'Свет' : 'Тьма'} · A
            </div>
            <div className="font-display text-sm uppercase break-words leading-tight" title={teamAName}>
              {teamAName || '—'}
            </div>
            <div className="font-display text-5xl mt-1 tabular text-radiant">
              {fmtPct(probA, 1)}
            </div>
          </div>
          <div className={!aWide ? 'opacity-100 text-right' : 'opacity-50 text-right'}>
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-300">
              B · {sideA === 'radiant' ? 'Тьма' : 'Свет'}
            </div>
            <div className="font-display text-sm uppercase break-words leading-tight" title={teamBName}>
              {teamBName || '—'}
            </div>
            <div className="font-display text-5xl mt-1 tabular text-dire">
              {fmtPct(probB, 1)}
            </div>
          </div>
        </div>
        <div className="h-2 hairline bg-ink-900 flex">
          <div
            className="bg-radiant transition-all duration-500"
            style={{ width: `${probA * 100}%` }}
          />
          <div
            className="bg-dire transition-all duration-500"
            style={{ width: `${probB * 100}%` }}
          />
        </div>

        {/* Honest confidence indicator */}
        {prediction.confidence && (
          <div className="mt-2 flex items-start gap-2">
            <span
              className={`font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 hairline ${
                prediction.confidence === 'high'
                  ? 'text-radiant border-radiant/40'
                  : prediction.confidence === 'medium'
                    ? 'text-ink-100 border-ink-500'
                    : 'text-dire border-dire/40'
              }`}
            >
              {prediction.confidence === 'high'
                ? 'уверенность: высокая'
                : prediction.confidence === 'medium'
                  ? 'уверенность: средняя'
                  : 'уверенность: низкая'}
            </span>
            {prediction.confidenceNote && (
              <span className="font-mono text-[10px] text-ink-300 leading-snug flex-1">
                {prediction.confidenceNote}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Factor breakdown */}
      <div>
        <h4 className="font-display text-xs uppercase tracking-[0.2em] text-ink-200 mb-3">
          Вклад факторов · в логите
        </h4>
        <ul className="space-y-2">
          {factors.map(([key, v]) => {
            const pct = (Math.abs(v) / maxAbs) * 100;
            const pos = v >= 0;
            return (
              <li key={key} className="group" title={FACTOR_EXPLAIN[key]}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-ink-100">{FACTOR_LABELS[key]}</span>
                  <span
                    className={`font-mono tabular ${
                      pos ? 'text-radiant' : 'text-dire'
                    }`}
                  >
                    {fmtSigned(v)}
                  </span>
                </div>
                <div className="relative h-1 bg-ink-900 hairline">
                  <div
                    className={`absolute top-0 h-full ${pos ? 'bg-radiant' : 'bg-dire'}`}
                    style={{
                      left: pos ? '50%' : `${50 - pct / 2}%`,
                      width: `${pct / 2}%`,
                    }}
                  />
                  <div className="absolute left-1/2 top-0 h-full w-px bg-ink-500" />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[10px] font-mono text-ink-300 leading-relaxed">
          Знак «+» — в пользу команды A. Длина бара — относительный вклад в логит.
        </p>
      </div>

      {/* Stat readout */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat label="Elo A" value={teamAStats ? Math.round(teamAStats.elo).toString() : '—'} />
        <Stat label="Elo B" value={teamBStats ? Math.round(teamBStats.elo).toString() : '—'} />
        <Stat
          label="Форма A"
          value={teamAStats ? fmtPct(teamAStats.recentFormWR) : '—'}
        />
        <Stat
          label="Форма B"
          value={teamBStats ? fmtPct(teamBStats.recentFormWR) : '—'}
        />
        <Stat
          label="WR A в пуле"
          value={
            teamAStats
              ? `${fmtPct(teamAStats.winrate)} (${teamAStats.matches}м)`
              : '—'
          }
        />
        <Stat
          label="WR B в пуле"
          value={
            teamBStats
              ? `${fmtPct(teamBStats.winrate)} (${teamBStats.matches}м)`
              : '—'
          }
        />
        <Stat
          label="H2H A:B"
          value={`${h2h.winsA} : ${h2h.winsB} (${h2h.totalGames})`}
        />
        <Stat label="WR Света в пуле" value={fmtPct(poolRadiantWR)} />
        <Stat label="Матчей с пиками" value={poolGameCount.toString()} />
        {data.seriesH2H && data.seriesH2H.seriesPlayed > 0 && (
          <Stat
            label="Серии A:B"
            value={`${data.seriesH2H.seriesWinsA} : ${data.seriesH2H.seriesWinsB} (${data.seriesH2H.seriesPlayed})`}
          />
        )}
      </div>

      {/* Model + calibration badges */}
      {(prediction.usedTrainedModel || prediction.calibrated) && (
        <div className="hairline px-3 py-2 bg-ink-900 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {prediction.usedTrainedModel && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-radiant">
                ✓ Обученная модель
              </span>
            )}
            {prediction.calibrated && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-radiant">
                ✓ Откалибровано
              </span>
            )}
          </div>
          {prediction.rawProbA != null && prediction.calibrated && (
            <span className="font-mono text-[10px] text-ink-300">
              {fmtPct(prediction.rawProbA, 1)} → {fmtPct(prediction.probA, 1)}
            </span>
          )}
        </div>
      )}

      {data.warnings.length > 0 && (
        <div className="hairline p-3 bg-ink-900">
          <div className="font-mono text-[10px] uppercase text-ink-300 mb-1">
            Предупреждения
          </div>
          <ul className="space-y-1 text-xs text-ink-200">
            {data.warnings.map((w, i) => (
              <li key={i}>· {w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="hairline px-2.5 py-1.5 bg-ink-900">
      <div className="font-mono text-[9px] uppercase tracking-wider text-ink-300">
        {label}
      </div>
      <div className="font-mono text-sm tabular text-ink-100 mt-0.5">{value}</div>
    </div>
  );
}
