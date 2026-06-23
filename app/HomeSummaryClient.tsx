'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type HistoricalPeriod = 'latest' | '24h' | '7d' | '1m';
type ChartView = 'bar' | 'line' | 'pie';
type MetricKey = 'current' | 'average' | 'runs' | 'successRate' | 'averageLatency';

interface HomeSummaryClientProps {
  snapshots: any[];
  modelIds: number[];
  period: HistoricalPeriod;
}

interface SeriesPoint {
  timestamp: string;
  score: number;
}

interface ModelSummary {
  id: string;
  numericId: number | null;
  name: string;
  vendor: string;
  color: string;
  points: SeriesPoint[];
  current: number | null;
  average: number | null;
  minimum: number | null;
  maximum: number | null;
  delta: number | null;
  runs: number | null;
  successRate: number | null;
  averageLatency: number | null;
}

const PERIODS: HistoricalPeriod[] = ['latest', '24h', '7d', '1m'];

const PERIOD_LABELS: Record<HistoricalPeriod, string> = {
  latest: 'LATEST',
  '24h': '24H',
  '7d': '7D',
  '1m': '1M',
};

const COLORS: Record<string, string> = {
  '256': '#00ff41',
  '220': '#00bfff',
  '250': '#ffb000',
  '268': '#ff4d8d',
};

const FALLBACK_COLORS = ['#00ff41', '#00bfff', '#ffb000', '#ff4d8d', '#c084fc', '#f97316'];

const CHART_VIEWS: Array<{ key: ChartView; label: string }> = [
  { key: 'bar', label: 'BAR' },
  { key: 'line', label: 'LINE' },
  { key: 'pie', label: 'PIE' },
];

const METRICS: Record<MetricKey, {
  label: string;
  dataLabel: string;
  digits: number;
  suffix?: string;
}> = {
  current: { label: 'CURRENT', dataLabel: 'Current Score', digits: 0 },
  average: { label: 'AVERAGE', dataLabel: 'Average Score', digits: 1 },
  runs: { label: 'RUNS', dataLabel: 'Runs', digits: 0 },
  successRate: { label: 'SUCCESS', dataLabel: 'Success Rate', digits: 1, suffix: '%' },
  averageLatency: { label: 'LATENCY', dataLabel: 'Average Latency', digits: 0, suffix: 'ms' },
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

const formatNumber = (value: number | null, digits = 0) => (
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--'
);

const formatLatency = (value: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
};

const formatMetricValue = (value: number | null, metric: MetricKey) => {
  if (metric === 'averageLatency') return formatLatency(value);

  const config = METRICS[metric];
  const formatted = formatNumber(value, config.digits);
  return formatted === '--' ? formatted : `${formatted}${config.suffix || ''}`;
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

function summarizeModel(snapshot: any, period: HistoricalPeriod, index: number): ModelSummary {
  const points = periodHistory(snapshot, period);
  const scores = points.map((point) => point.score);
  const stats = snapshot?.snapshots?.speed?.[period]?.stats?.data || {};
  const first = scores[0] ?? null;
  const last = scores[scores.length - 1] ?? toDisplayScore(snapshot?.model?.data?.latestScore);
  const modelId = String(snapshot?.modelId ?? `model-${index + 1}`);
  const hasStatsRuns = typeof stats.totalRuns === 'number' && stats.totalRuns > 0;

  return {
    id: modelId,
    numericId: typeof snapshot?.modelId === 'number' ? snapshot.modelId : null,
    name: formatModelName(snapshot),
    vendor: snapshot?.model?.data?.vendor || 'unknown',
    color: COLORS[modelId] || FALLBACK_COLORS[index % FALLBACK_COLORS.length],
    points,
    current: last,
    average: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : last,
    minimum: scores.length ? Math.min(...scores) : last,
    maximum: scores.length ? Math.max(...scores) : last,
    delta: typeof first === 'number' && typeof last === 'number' ? last - first : null,
    runs: hasStatsRuns ? stats.totalRuns : points.length,
    successRate: hasStatsRuns && typeof stats.successRate === 'number' ? stats.successRate : null,
    averageLatency: hasStatsRuns && typeof stats.averageLatency === 'number' ? stats.averageLatency : null,
  };
}

function buildTimeline(models: ModelSummary[], period: HistoricalPeriod) {
  const timestamps = Array.from(new Set(models.flatMap((model) => model.points.map((point) => point.timestamp))))
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const maps = new Map(models.map((model) => [
    model.id,
    new Map(model.points.map((point) => [point.timestamp, point.score])),
  ]));

  return timestamps.map((timestamp) => {
    const row: Record<string, string | number | null> = {
      timestamp,
      label: formatTimestamp(timestamp, period),
    };

    models.forEach((model) => {
      row[model.id] = maps.get(model.id)?.get(timestamp) ?? null;
    });

    return row;
  });
}

function buildPeriodRows(snapshots: any[]) {
  return PERIODS.map((period) => {
    const scores = snapshots.flatMap((snapshot) => periodHistory(snapshot, period).map((point) => point.score));
    const average = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;

    return {
      period,
      label: PERIOD_LABELS[period],
      average,
      points: scores.length,
    };
  });
}

function deriveYDomain(models: ModelSummary[]) {
  const values = models.flatMap((model) => model.points.map((point) => point.score));
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
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className="md-comparison-tooltip">
      <div className="md-comparison-tooltip-title">{label}</div>
      {payload
        .filter((item: any) => typeof item.value === 'number')
        .map((item: any) => (
          <div key={`${item.dataKey}-${item.name}`} className="md-comparison-tooltip-row">
            <span className="md-comparison-dot" style={{ background: item.color || item.payload?.fill }} />
            <span style={{ color: item.color || item.payload?.fill }}>{item.name || item.payload?.name}</span>
            <strong>{Math.round(item.value)}</strong>
          </div>
        ))}
    </div>
  );
}

function MetricTooltip({ active, payload, label, metric }: any) {
  if (!active || !payload?.length) return null;

  const item = payload.find((entry: any) => typeof entry.value === 'number') || payload[0];
  const color = item?.payload?.fill || item?.color || '#00ff41';

  return (
    <div className="md-comparison-tooltip">
      <div className="md-comparison-tooltip-title">{item?.payload?.name || label}</div>
      <div className="md-comparison-tooltip-row">
        <span className="md-comparison-dot" style={{ background: color }} />
        <span style={{ color }}>{METRICS[metric as MetricKey].dataLabel}</span>
        <strong>{formatMetricValue(item?.value ?? null, metric as MetricKey)}</strong>
      </div>
    </div>
  );
}

function renderMetricChart(chartView: ChartView, metric: MetricKey, data: any[]) {
  const validPieData = data.filter((item) => typeof item.value === 'number' && item.value > 0);

  if (chartView === 'pie') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 8, right: 18, bottom: 8, left: 18 }}>
          <Tooltip content={<MetricTooltip metric={metric} />} />
          <Legend
            verticalAlign="bottom"
            height={42}
            formatter={(value, entry: any) => (
              <span style={{ color: entry?.payload?.fill || '#c0c0c0' }}>{entry?.payload?.name || value}</span>
            )}
          />
          <Pie
            data={validPieData}
            dataKey="value"
            nameKey="name"
            innerRadius={62}
            outerRadius={112}
            paddingAngle={3}
            label={(entry) => entry.id}
            labelLine={false}
          >
            {validPieData.map((item) => (
              <Cell key={item.id} fill={item.fill} stroke="#0a0a0a" strokeWidth={2} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chartView === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 24, right: 26, bottom: 28, left: 4 }}>
          <CartesianGrid strokeDasharray="4 4" stroke="rgba(220,236,224,0.16)" vertical={false} />
          <XAxis
            dataKey="id"
            tick={{ fill: 'rgba(220,236,224,0.78)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
            axisLine={{ stroke: 'rgba(192,192,192,0.35)' }}
            tickLine={{ stroke: 'rgba(192,192,192,0.28)' }}
          />
          <YAxis
            tick={{ fill: 'rgba(220,236,224,0.78)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={{ stroke: 'rgba(192,192,192,0.35)' }}
            tickLine={{ stroke: 'rgba(192,192,192,0.28)' }}
          />
          <Tooltip content={<MetricTooltip metric={metric} />} />
          <Line
            type="monotone"
            dataKey="value"
            name={METRICS[metric].dataLabel}
            stroke="#00bfff"
            strokeWidth={3}
            dot={(props: any) => {
              const fill = data[props.index]?.fill || '#00bfff';
              return (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={5}
                  fill={fill}
                  stroke="#0a0a0a"
                  strokeWidth={2}
                />
              );
            }}
            activeDot={{ r: 7, stroke: '#0a0a0a', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 24, right: 26, bottom: 28, left: 4 }}>
        <CartesianGrid strokeDasharray="4 4" stroke="rgba(220,236,224,0.16)" vertical={false} />
        <XAxis
          dataKey="id"
          tick={{ fill: 'rgba(220,236,224,0.78)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
          axisLine={{ stroke: 'rgba(192,192,192,0.35)' }}
          tickLine={{ stroke: 'rgba(192,192,192,0.28)' }}
        />
        <YAxis
          tick={{ fill: 'rgba(220,236,224,0.78)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
          axisLine={{ stroke: 'rgba(192,192,192,0.35)' }}
          tickLine={{ stroke: 'rgba(192,192,192,0.28)' }}
        />
        <Tooltip content={<MetricTooltip metric={metric} />} />
        <Bar dataKey="value" name={METRICS[metric].dataLabel} radius={[3, 3, 0, 0]}>
          {data.map((item) => (
            <Cell key={item.id} fill={item.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function HomeSummaryClient({ snapshots, modelIds, period }: HomeSummaryClientProps) {
  const [chartView, setChartView] = useState<ChartView>('bar');
  const [metric, setMetric] = useState<MetricKey>('average');

  const models = useMemo(
    () => snapshots.map((snapshot, index) => summarizeModel(snapshot, period, index)),
    [snapshots, period],
  );
  const visibleModels = useMemo(() => models.filter((model) => model.points.length > 0 || model.current !== null), [models]);
  const timeline = useMemo(() => buildTimeline(visibleModels, period), [visibleModels, period]);
  const periodRows = useMemo(() => buildPeriodRows(snapshots), [snapshots]);
  const yDomain = useMemo(() => deriveYDomain(visibleModels), [visibleModels]);
  const metricData = useMemo(
    () => visibleModels.map((model) => ({
      id: model.id,
      name: model.name,
      value: model[metric],
      fill: model.color,
    })),
    [visibleModels, metric],
  );

  const bestAverage = [...visibleModels]
    .filter((model): model is ModelSummary & { average: number } => typeof model.average === 'number')
    .sort((a, b) => b.average - a.average)[0] || null;
  const bestCurrent = [...visibleModels]
    .filter((model): model is ModelSummary & { current: number } => typeof model.current === 'number')
    .sort((a, b) => b.current - a.current)[0] || null;
  const totalPoints = visibleModels.reduce((sum, model) => sum + model.points.length, 0);
  const fetchedAt = snapshots[0]?.fetchedAt ? new Date(snapshots[0].fetchedAt).toLocaleString() : 'live fetch';
  const compareHref = `/snapshot/compare?ids=${encodeURIComponent(modelIds.join(','))}&period=${encodeURIComponent(period)}`;

  if (visibleModels.length === 0) {
    return (
      <main className="md-comparison-page md-home-page">
        <section className="md-comparison-panel">
          <div className="md-chart-empty">
            <div className="md-chart-empty-inner">
              <div className="md-chart-empty-title">NO DASHBOARD DATA</div>
              <div className="md-chart-empty-sub">No usable model history was returned for {modelIds.join(', ')}.</div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="md-comparison-page md-home-page">
      <section className="md-comparison-panel md-home-panel">
        <header className="md-comparison-header md-home-header">
          <div>
            <div className="md-comparison-kicker">AI STUPID METER</div>
            <h1>Model Snapshot Dashboard</h1>
            <p>{modelIds.join(', ')} extracted into score, volume, latency, period, and timeline views.</p>
          </div>
          <div className="md-comparison-meta">
            <span>IDS: {modelIds.join(', ')}</span>
            <span>PERIOD: {PERIOD_LABELS[period]}</span>
            <span>POINTS: {totalPoints}</span>
            <span>FETCHED: {fetchedAt}</span>
            <a href={compareHref}>COMPARE SNAPSHOT</a>
          </div>
        </header>

        <div className="md-home-kpi-grid">
          <div className="md-home-kpi">
            <span>MODELS</span>
            <strong>{visibleModels.length}</strong>
            <em>{modelIds.length} requested</em>
          </div>
          <div className="md-home-kpi">
            <span>BEST AVG</span>
            <strong style={{ color: bestAverage?.color || '#00ff41' }}>{bestAverage?.name || '--'}</strong>
            <em>{bestAverage ? `${formatNumber(bestAverage.average, 1)} score` : '--'}</em>
          </div>
          <div className="md-home-kpi">
            <span>BEST CURRENT</span>
            <strong style={{ color: bestCurrent?.color || '#00bfff' }}>{bestCurrent?.name || '--'}</strong>
            <em>{bestCurrent ? `${formatNumber(bestCurrent.current)} score` : '--'}</em>
          </div>
          <div className="md-home-kpi">
            <span>PERIODS</span>
            <strong>{periodRows.filter((row) => row.average !== null).length}</strong>
            <em>{PERIODS.map((item) => PERIOD_LABELS[item]).join(' / ')}</em>
          </div>
        </div>

        <div className="md-home-model-grid">
          {visibleModels.map((model) => (
            <article key={model.id} className="md-home-model-card" style={{ borderColor: `${model.color}88` }}>
              <div className="md-home-model-top">
                <span style={{ color: model.color }}>ID {model.id}</span>
                <em>{model.vendor}</em>
              </div>
              <h2 style={{ color: model.color }}>{model.name}</h2>
              <div className="md-home-model-score" style={{ color: model.color }}>{formatNumber(model.current)}</div>
              <div className="md-home-model-metrics">
                <span>AVG <strong>{formatNumber(model.average, 1)}</strong></span>
                <span>MIN <strong>{formatNumber(model.minimum)}</strong></span>
                <span>MAX <strong>{formatNumber(model.maximum)}</strong></span>
                <span>DELTA <strong>{formatNumber(model.delta)}</strong></span>
                <span>RUNS <strong>{formatNumber(model.runs)}</strong></span>
                <span>LAT <strong>{formatLatency(model.averageLatency)}</strong></span>
              </div>
            </article>
          ))}
        </div>

        <div className="md-home-chart-grid">
          <section className="md-home-chart md-home-chart-wide">
            <div className="md-home-section-head">
              <div>
                <span>Timeline</span>
                <strong>{PERIOD_LABELS[period]} score movement</strong>
              </div>
            </div>
            <div className="md-home-chart-body md-home-chart-body-tall">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeline} margin={{ top: 24, right: 34, bottom: 36, left: 4 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="rgba(220,236,224,0.16)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    minTickGap={28}
                    tick={{ fill: 'rgba(220,236,224,0.78)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                    axisLine={{ stroke: 'rgba(192,192,192,0.35)' }}
                    tickLine={{ stroke: 'rgba(192,192,192,0.28)' }}
                  />
                  <YAxis
                    domain={yDomain}
                    tick={{ fill: 'rgba(220,236,224,0.78)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                    axisLine={{ stroke: 'rgba(192,192,192,0.35)' }}
                    tickLine={{ stroke: 'rgba(192,192,192,0.28)' }}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  {visibleModels.map((model) => (
                    <Line
                      key={model.id}
                      type="monotone"
                      dataKey={model.id}
                      name={model.name}
                      stroke={model.color}
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 5, fill: model.color, stroke: '#0a0a0a', strokeWidth: 2 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="md-home-chart">
            <div className="md-home-section-head">
              <div>
                <span>Metric mixer</span>
                <strong>{METRICS[metric].dataLabel}</strong>
              </div>
              <div className="md-home-segment">
                {CHART_VIEWS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={chartView === item.key}
                    className={chartView === item.key ? 'active' : ''}
                    onClick={() => setChartView(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="md-home-metric-tabs">
              {(Object.keys(METRICS) as MetricKey[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={metric === item}
                  className={metric === item ? 'active' : ''}
                  onClick={() => setMetric(item)}
                >
                  {METRICS[item].label}
                </button>
              ))}
            </div>
            <div className="md-home-chart-body">
              {renderMetricChart(chartView, metric, metricData)}
            </div>
          </section>

          <section className="md-home-chart">
            <div className="md-home-section-head">
              <div>
                <span>Period averages</span>
                <strong>All fetched windows</strong>
              </div>
            </div>
            <div className="md-home-chart-body">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={periodRows} margin={{ top: 24, right: 26, bottom: 28, left: 4 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="rgba(220,236,224,0.16)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'rgba(220,236,224,0.78)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                    axisLine={{ stroke: 'rgba(192,192,192,0.35)' }}
                    tickLine={{ stroke: 'rgba(192,192,192,0.28)' }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: 'rgba(220,236,224,0.78)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                    axisLine={{ stroke: 'rgba(192,192,192,0.35)' }}
                    tickLine={{ stroke: 'rgba(192,192,192,0.28)' }}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="average" name="Average Score" radius={[3, 3, 0, 0]}>
                    {periodRows.map((row) => (
                      <Cell
                        key={row.period}
                        fill={row.period === period ? '#00ff41' : row.period === '24h' ? '#00bfff' : row.period === '1m' ? '#ff4d8d' : '#ffb000'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        <div className="md-home-data-table">
          <div className="md-home-data-head">
            <span>MODEL</span>
            <span>CURRENT</span>
            <span>AVG</span>
            <span>MIN</span>
            <span>MAX</span>
            <span>DELTA</span>
            <span>RUNS</span>
            <span>SUCCESS</span>
            <span>LATENCY</span>
          </div>
          {visibleModels.map((model) => (
            <div key={model.id} className="md-home-data-row">
              <span className="md-home-data-model" style={{ color: model.color }}>{model.name}</span>
              <span>{formatNumber(model.current)}</span>
              <span>{formatNumber(model.average, 1)}</span>
              <span>{formatNumber(model.minimum)}</span>
              <span>{formatNumber(model.maximum)}</span>
              <span>{formatNumber(model.delta)}</span>
              <span>{formatNumber(model.runs)}</span>
              <span>{formatNumber(model.successRate, 1)}%</span>
              <span>{formatLatency(model.averageLatency)}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
