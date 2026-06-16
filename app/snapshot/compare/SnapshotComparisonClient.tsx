'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type HistoricalPeriod = 'latest' | '24h' | '7d' | '1m';

interface SnapshotComparisonClientProps {
  snapshots: any[];
  period: HistoricalPeriod;
}

interface SeriesPoint {
  timestamp: string;
  score: number;
}

interface ModelSeries {
  id: string;
  name: string;
  vendor: string;
  color: string;
  points: SeriesPoint[];
  current: number | null;
  average: number | null;
  minimum: number | null;
  maximum: number | null;
  delta: number | null;
  totalRuns: number | null;
  successRate: number | null;
  averageLatency: number | null;
}

const COLORS: Record<string, string> = {
  '256': '#00ff41',
  '220': '#00bfff',
  '250': '#ff9f1c',
  '268': '#ff4d8d',
};

const PERIOD_LABELS: Record<HistoricalPeriod, string> = {
  latest: 'LATEST',
  '24h': '24H',
  '7d': '7D',
  '1m': '1M',
};

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));

const toDisplayScore = (point: any): number | null => {
  if (!point) return null;
  if (typeof point.score === 'number' && !Number.isNaN(point.score)) return clamp(Math.round(point.score));

  const direct =
    typeof point.displayScore === 'number'
      ? point.displayScore
      : typeof point.currentScore === 'number'
        ? point.currentScore
        : null;

  if (typeof direct === 'number' && !Number.isNaN(direct)) return clamp(Math.round(direct));

  const z = typeof point.stupidScore === 'number' ? point.stupidScore : null;
  if (z !== null && !Number.isNaN(z)) {
    if (z >= 0 && z <= 100) return clamp(Math.round(z));
    return clamp(Math.round(50 + z * 10));
  }

  return null;
};

const formatModelName = (snapshot: any) => {
  const model = snapshot?.model?.data || {};
  return model.displayName || model.name || `model-${snapshot?.modelId || 'unknown'}`;
};

const formatTimestamp = (timestamp: string, period: HistoricalPeriod) => {
  const date = new Date(timestamp);

  if (period === '24h') {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  if (period === '7d') {
    return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const formatValue = (value: number | null, digits = 0) => (
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--'
);

const formatLatency = (value: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
};

const deriveYDomain = (series: ModelSeries[]) => {
  const values = series.flatMap((item) => item.points.map((point) => point.score));
  if (values.length === 0) return [0, 100] as [number, number];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max(4, Math.round((max - min) * 0.25));
  const lo = Math.max(0, Math.floor(min - padding));
  const hi = Math.min(100, Math.ceil(max + padding));

  if (hi - lo < 12) {
    const mid = (hi + lo) / 2;
    return [Math.max(0, Math.floor(mid - 8)), Math.min(100, Math.ceil(mid + 8))];
  }

  return [lo, hi];
};

const periodHistory = (snapshot: any, period: HistoricalPeriod) => {
  const raw = snapshot?.snapshots?.speed?.[period]?.history?.data?.data;
  if (!Array.isArray(raw)) return [];

  const limited = period === 'latest' ? raw.slice(0, 72) : raw;

  return limited
    .map((point: any) => {
      const score = toDisplayScore(point);
      if (score === null) return null;

      return {
        timestamp: point.timestamp || new Date().toISOString(),
        score,
      };
    })
    .filter((point: SeriesPoint | null): point is SeriesPoint => Boolean(point))
    .reverse();
};

const calculateSeries = (snapshots: any[], period: HistoricalPeriod): ModelSeries[] => (
  snapshots.map((snapshot, index) => {
    const points = periodHistory(snapshot, period);
    const scores = points.map((point) => point.score);
    const stats = snapshot?.snapshots?.speed?.[period]?.stats?.data || {};
    const first = scores[0] ?? null;
    const last = scores[scores.length - 1] ?? null;

    const hasStatsRuns = typeof stats.totalRuns === 'number' && stats.totalRuns > 0;

    return {
      id: String(snapshot?.modelId ?? `model-${index}`),
      name: formatModelName(snapshot),
      vendor: snapshot?.model?.data?.vendor || 'unknown',
      color: COLORS[snapshot?.modelId] || ['#00ff41', '#00bfff', '#ff9f1c', '#ff4d8d'][index % 4],
      points,
      current: last,
      average: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
      minimum: scores.length ? Math.min(...scores) : null,
      maximum: scores.length ? Math.max(...scores) : null,
      delta: typeof first === 'number' && typeof last === 'number' ? last - first : null,
      totalRuns: hasStatsRuns ? stats.totalRuns : points.length,
      successRate: hasStatsRuns && typeof stats.successRate === 'number' ? stats.successRate : null,
      averageLatency: hasStatsRuns && typeof stats.averageLatency === 'number' ? stats.averageLatency : null,
    };
  }).filter((series) => series.points.length > 0)
);

function buildChartData(series: ModelSeries[], period: HistoricalPeriod) {
  const timestamps = Array.from(new Set(series.flatMap((item) => item.points.map((point) => point.timestamp))))
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const maps = new Map(series.map((item) => [
    item.id,
    new Map(item.points.map((point) => [point.timestamp, point.score])),
  ]));

  return timestamps.map((timestamp, index) => {
    const row: Record<string, string | number | null> = {
      timestamp,
      label: formatTimestamp(timestamp, period),
      index: index + 1,
    };

    series.forEach((item) => {
      row[item.id] = maps.get(item.id)?.get(timestamp) ?? null;
    });

    return row;
  });
}

function findLastIndexes(chartData: Array<Record<string, any>>, series: ModelSeries[]) {
  const result: Record<string, number> = {};

  series.forEach((item) => {
    for (let index = chartData.length - 1; index >= 0; index -= 1) {
      if (typeof chartData[index]?.[item.id] === 'number') {
        result[item.id] = index;
        break;
      }
    }
  });

  return result;
}

function getWinner(series: ModelSeries[]) {
  return [...series]
    .filter((item) => typeof item.average === 'number')
    .sort((a, b) => (b.average || 0) - (a.average || 0))[0] || null;
}

function getComparisonTitle(series: ModelSeries[]) {
  const names = series.map((item) => item.name);

  if (names.length === 4 && names.some((name) => name.toLowerCase().includes('gpt-5.5'))) {
    return 'GPT-5.5 + Claude Opus 4.6 / 4.7 / 4.8';
  }

  return names.join(' / ');
}

export default function SnapshotComparisonClient({ snapshots, period }: SnapshotComparisonClientProps) {
  const searchParams = useSearchParams();
  const exportMode = searchParams.get('capture') === '1';
  const series = useMemo(() => calculateSeries(snapshots, period), [snapshots, period]);
  const chartData = useMemo(() => buildChartData(series, period), [series, period]);
  const lastIndexes = useMemo(() => findLastIndexes(chartData, series), [chartData, series]);
  const yDomain = useMemo(() => deriveYDomain(series), [series]);
  const winner = getWinner(series);
  const comparisonTitle = getComparisonTitle(series);
  const fetchedAt = snapshots[0]?.fetchedAt ? new Date(snapshots[0].fetchedAt).toLocaleString() : 'local snapshot';

  const tooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;

    return (
      <div className="md-comparison-tooltip">
        <div className="md-comparison-tooltip-title">{label}</div>
        {payload
          .filter((item: any) => typeof item.value === 'number')
          .map((item: any) => (
            <div key={item.dataKey} className="md-comparison-tooltip-row">
              <span className="md-comparison-dot" style={{ background: item.color }} />
              <span style={{ color: item.color }}>{item.name}</span>
              <strong>{Math.round(item.value)}</strong>
            </div>
          ))}
      </div>
    );
  };

  if (series.length === 0) {
    return (
      <main className="md-comparison-page">
        <section className="md-comparison-panel">
          <div className="md-chart-empty">
            <div className="md-chart-empty-inner">
              <div className="md-chart-empty-title">NO COMPARISON DATA</div>
              <div className="md-chart-empty-sub">Run fetch:model-detail-snapshot before capturing the comparison image.</div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={`md-comparison-page ${exportMode ? 'md-comparison-capture' : ''}`}>
      <section className="md-comparison-panel">
        <header className="md-comparison-header">
          <div>
            <div className="md-comparison-kicker">CODING DATA OVERLAY</div>
            <h1>{comparisonTitle}</h1>
            <p>All selected coding timelines rendered on one image with distinct colors, endpoint labels, focused Y-axis scaling, and side-by-side metrics.</p>
          </div>
          <div className="md-comparison-meta">
            <span>MODE: 7-AXIS CODING</span>
            <span>PERIOD: {PERIOD_LABELS[period]}</span>
            <span>FETCHED: {fetchedAt}</span>
          </div>
        </header>

        <div className="md-comparison-summary">
          {series.map((item) => (
            <div key={item.id} className="md-comparison-model" style={{ borderColor: `${item.color}88` }}>
              <div className="md-comparison-model-name" style={{ color: item.color }}>{item.name}</div>
              <div className="md-comparison-model-score" style={{ color: item.color }}>
                {formatValue(item.current)}
              </div>
              <div className="md-comparison-model-grid">
                <span>AVG <strong>{formatValue(item.average, 1)}</strong></span>
                <span>Δ <strong>{formatValue(item.delta, 0)}</strong></span>
                <span>PTS <strong>{item.points.length}</strong></span>
              </div>
            </div>
          ))}
        </div>

        <div className="md-comparison-chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 26, right: 210, left: 18, bottom: 52 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(220,236,224,0.22)" strokeWidth={1.4} vertical={false} />
              <XAxis
                dataKey="label"
                interval="preserveStartEnd"
                minTickGap={28}
                tickMargin={10}
                tick={{ fill: 'rgba(220, 236, 224, 0.84)', fontSize: exportMode ? 14 : 11, fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                axisLine={{ stroke: 'rgba(192,192,192,0.4)', strokeWidth: 2 }}
                tickLine={{ stroke: 'rgba(192,192,192,0.32)', strokeWidth: 1 }}
              />
              <YAxis
                domain={yDomain}
                allowDataOverflow={false}
                width={82}
                tickCount={8}
                tickMargin={10}
                tick={{ fill: 'rgba(220, 236, 224, 0.9)', fontSize: exportMode ? 14 : 11, fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.72)', strokeWidth: 2 }}
                tickLine={{ stroke: 'rgba(255,255,255,0.42)', strokeWidth: 1.5 }}
                label={{
                  value: 'CODING SCORE',
                  angle: -90,
                  position: 'insideLeft',
                  fill: 'rgba(220, 236, 224, 0.95)',
                  fontSize: exportMode ? 14 : 10,
                  fontFamily: 'var(--font-mono)',
                  dx: -6,
                }}
              />
              <Tooltip content={tooltip} />
              {series.map((item, seriesIndex) => (
                <Line
                  key={item.id}
                  type="monotone"
                  dataKey={item.id}
                  name={item.name}
                  stroke={item.color}
                  strokeWidth={exportMode ? 4 : 3}
                  dot={false}
                  activeDot={{ r: 5, fill: item.color, stroke: '#020402', strokeWidth: 2 }}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  connectNulls
                  isAnimationActive={!exportMode}
                  style={{ filter: `drop-shadow(0 0 5px ${item.color}99)` }}
                >
                  <LabelList
                    dataKey={item.id}
                    content={(props: any) => {
                      if (props.index !== lastIndexes[item.id] || typeof props.value !== 'number') return null;
                      const labelY = props.y - 58 + seriesIndex * 44;
                      const labelX = props.x + 14;

                      return (
                        <g>
                          <line
                            x1={props.x}
                            y1={props.y}
                            x2={labelX}
                            y2={labelY + 15}
                            stroke={item.color}
                            strokeWidth={2}
                            strokeOpacity={0.85}
                          />
                          <rect
                            x={labelX}
                            y={labelY}
                            width={190}
                            height={34}
                            rx={2}
                            fill="#020402"
                            stroke={item.color}
                            strokeOpacity={1}
                            strokeWidth={1.5}
                          />
                          <text
                            x={labelX + 10}
                            y={labelY + 14}
                            fill={item.color}
                            fontSize={exportMode ? 14 : 11}
                            fontFamily="monospace"
                            fontWeight={700}
                          >
                            {item.name}
                          </text>
                          <text
                            x={labelX + 10}
                            y={labelY + 28}
                            fill="#dcece0"
                            fontSize={exportMode ? 13 : 10}
                            fontFamily="monospace"
                          >
                            current {Math.round(props.value)} / avg {formatValue(item.average, 1)}
                          </text>
                        </g>
                      );
                    }}
                  />
                </Line>
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="md-comparison-footer">
          <div className="md-comparison-table">
            <div className="md-comparison-table-head">DATA COMPARISON</div>
            {series.map((item) => (
              <div key={item.id} className="md-comparison-table-row">
                <span className="md-comparison-table-model" style={{ color: item.color }}>{item.name}</span>
                <span>current <strong>{formatValue(item.current)}</strong></span>
                <span>avg <strong>{formatValue(item.average, 1)}</strong></span>
                <span>range <strong>{formatValue(item.minimum)}-{formatValue(item.maximum)}</strong></span>
                <span>runs <strong>{formatValue(item.totalRuns)}</strong></span>
                <span>success <strong>{formatValue(item.successRate, 1)}%</strong></span>
                <span>latency <strong>{formatLatency(item.averageLatency)}</strong></span>
              </div>
            ))}
          </div>

          <aside className="md-comparison-callout">
            <span>BEST PERIOD AVG</span>
            <strong style={{ color: winner?.color || '#00ff41' }}>{winner?.name || '--'}</strong>
            <em>{winner ? `${formatValue(winner.average, 1)} average coding score` : 'No winner yet'}</em>
          </aside>
        </div>
      </section>
    </main>
  );
}
