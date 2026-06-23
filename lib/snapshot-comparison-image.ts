import { Resvg } from '@resvg/resvg-js';
import { join } from 'node:path';

type HistoricalPeriod = 'latest' | '24h' | '7d' | '1m';

type SeriesPoint = {
  timestamp: string;
  score: number;
};

type ModelSeries = {
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
};

type EndpointLabel = {
  series: ModelSeries;
  x: number;
  y: number;
  labelY: number;
};

const WIDTH = 1400;
const HEIGHT = 860;
const FONT_DIR = join(process.cwd(), 'node_modules', 'dejavu-fonts-ttf', 'ttf');
const FONT_FILES = [
  join(FONT_DIR, 'DejaVuSans.ttf'),
  join(FONT_DIR, 'DejaVuSans-Bold.ttf'),
  join(FONT_DIR, 'DejaVuSansCondensed.ttf'),
  join(FONT_DIR, 'DejaVuSansCondensed-Bold.ttf'),
  join(FONT_DIR, 'DejaVuSansMono.ttf'),
  join(FONT_DIR, 'DejaVuSansMono-Bold.ttf'),
];
const COLORS: Record<string, string> = {
  '256': '#00d45a',
  '220': '#00a7ff',
  '250': '#ff9f1c',
  '268': '#ff4d8d',
};
const FALLBACK_COLORS = ['#00d45a', '#00a7ff', '#ff9f1c', '#ff4d8d'];
const PERIOD_LABELS: Record<HistoricalPeriod, string> = {
  latest: 'LATEST',
  '24h': '24H',
  '7d': '7D',
  '1m': '1M',
};

const clamp = (value: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, value));

function escapeXml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toDisplayScore(point: any): number | null {
  if (!point) return null;
  if (typeof point.score === 'number' && Number.isFinite(point.score)) return clamp(Math.round(point.score));

  const direct =
    typeof point.displayScore === 'number'
      ? point.displayScore
      : typeof point.currentScore === 'number'
        ? point.currentScore
        : null;

  if (typeof direct === 'number' && Number.isFinite(direct)) return clamp(Math.round(direct));

  const z = typeof point.stupidScore === 'number' ? point.stupidScore : null;
  if (typeof z === 'number' && Number.isFinite(z)) {
    if (z >= 0 && z <= 100) return clamp(Math.round(z));
    return clamp(Math.round(50 + z * 10));
  }

  return null;
}

function formatModelName(snapshot: any) {
  const model = snapshot?.model?.data || {};
  return model.displayName || model.name || `model-${snapshot?.modelId || 'unknown'}`;
}

function formatNumber(value: number | null, digits = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--';
}

function formatLatency(value: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

function formatFetchedAt(snapshotResult: any) {
  const date = snapshotResult?.fetchedAt ? new Date(snapshotResult.fetchedAt) : new Date();
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatAxisTimestamp(timestamp: string, period: HistoricalPeriod) {
  const date = new Date(timestamp);

  if (period === '24h') {
    return date.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  return date.toLocaleDateString('en-US', {
    timeZone: 'Asia/Shanghai',
    month: 'short',
    day: '2-digit',
  });
}

function periodHistory(snapshot: any, period: HistoricalPeriod) {
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
    .reverse()
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function calculateSeries(snapshotResult: any, period: HistoricalPeriod): ModelSeries[] {
  const snapshots = Array.isArray(snapshotResult?.detail?.snapshots) ? snapshotResult.detail.snapshots : [];

  return snapshots
    .map((snapshot: any, index: number) => {
      const points = periodHistory(snapshot, period);
      const scores = points.map((point) => point.score);
      const stats = snapshot?.snapshots?.speed?.[period]?.stats?.data || {};
      const first = scores[0] ?? null;
      const last = scores[scores.length - 1] ?? null;
      const hasStatsRuns = typeof stats.totalRuns === 'number' && stats.totalRuns > 0;
      const id = String(snapshot?.modelId ?? `model-${index}`);

      return {
        id,
        name: formatModelName(snapshot),
        vendor: snapshot?.model?.data?.vendor || 'unknown',
        color: COLORS[id] || FALLBACK_COLORS[index % FALLBACK_COLORS.length],
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
    })
    .filter((series: ModelSeries) => series.points.length > 0);
}

function deriveYDomain(series: ModelSeries[]) {
  const values = series.flatMap((item) => item.points.map((point) => point.score));
  if (values.length === 0) return [0, 100] as [number, number];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max(4, Math.round((max - min) * 0.25));
  let lo = Math.max(0, Math.floor(min - padding));
  let hi = Math.min(100, Math.ceil(max + padding));

  if (hi - lo < 12) {
    const mid = (hi + lo) / 2;
    lo = Math.max(0, Math.floor(mid - 8));
    hi = Math.min(100, Math.ceil(mid + 8));
  }

  return [lo, hi] as [number, number];
}

function getWinner(series: ModelSeries[]) {
  return [...series]
    .filter((item): item is ModelSeries & { average: number } => typeof item.average === 'number')
    .sort((a, b) => b.average - a.average)[0] || null;
}

function getComparisonTitle(series: ModelSeries[]) {
  const names = series.map((item) => item.name);

  if (names.length === 4 && names.some((name) => name.toLowerCase().includes('gpt-5.5'))) {
    return 'GPT-5.5 + Claude Opus 4.6 / 4.7 / 4.8';
  }

  return names.join(' / ');
}

function getTimeExtent(series: ModelSeries[]) {
  const times = series
    .flatMap((item) => item.points.map((point) => new Date(point.timestamp).getTime()))
    .filter((time) => Number.isFinite(time));

  if (times.length === 0) {
    const now = Date.now();
    return [now - 1, now] as [number, number];
  }

  const min = Math.min(...times);
  const max = Math.max(...times);

  return min === max ? [min - 1, max + 1] as [number, number] : [min, max] as [number, number];
}

function buildPath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
}

function buildEndpointLabels(labels: EndpointLabel[], plotTop: number, plotBottom: number) {
  const gap = 48;
  const sorted = [...labels].sort((a, b) => a.labelY - b.labelY);

  sorted.forEach((label, index) => {
    if (index === 0) {
      label.labelY = clamp(label.labelY, plotTop + 4, plotBottom - 42);
      return;
    }

    label.labelY = Math.max(label.labelY, sorted[index - 1].labelY + gap);
  });

  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    sorted[index].labelY = Math.min(sorted[index].labelY, plotBottom - 42 - (sorted.length - 1 - index) * gap);
  }

  return labels;
}

function renderNoDataSvg(snapshotResult: any) {
  const fetchedAt = formatFetchedAt(snapshotResult);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#08110f"/>
  <rect x="42" y="42" width="${WIDTH - 84}" height="${HEIGHT - 84}" rx="18" fill="#0f1b18" stroke="#28433a"/>
  <text x="92" y="126" fill="#f1fff8" font-size="34" font-family="Inter" font-weight="800">AI Stupid Meter Coding Overlay</text>
  <text x="92" y="172" fill="#89a39b" font-size="18" font-family="Inter">Fetched ${escapeXml(fetchedAt)}</text>
  <text x="92" y="284" fill="#f1fff8" font-size="30" font-family="Inter" font-weight="700">No comparison data available</text>
</svg>`;
}

function getResvgOptions() {
  return {
    fitTo: { mode: 'width' as const, value: WIDTH },
    font: {
      fontFiles: FONT_FILES,
      loadSystemFonts: false,
      defaultFontFamily: 'DejaVu Sans',
    },
  };
}

export async function renderSnapshotComparisonPng(snapshotResult: any, period: HistoricalPeriod = '7d') {
  const series = calculateSeries(snapshotResult, period);

  if (series.length === 0) {
    const empty = new Resvg(renderNoDataSvg(snapshotResult), getResvgOptions());
    return empty.render().asPng();
  }

  const fetchedAt = formatFetchedAt(snapshotResult);
  const title = getComparisonTitle(series);
  const winner = getWinner(series);
  const [yMin, yMax] = deriveYDomain(series);
  const [timeMin, timeMax] = getTimeExtent(series);
  const plot = {
    left: 112,
    top: 270,
    width: 1016,
    height: 358,
  };
  const plotRight = plot.left + plot.width;
  const plotBottom = plot.top + plot.height;
  const xScale = (timestamp: string) => {
    const time = new Date(timestamp).getTime();
    return plot.left + ((time - timeMin) / (timeMax - timeMin)) * plot.width;
  };
  const yScale = (score: number) => plot.top + ((yMax - score) / (yMax - yMin)) * plot.height;
  const yTicks = Array.from({ length: 7 }, (_, index) => Math.round(yMin + ((yMax - yMin) * index) / 6));
  const xTickTimes = Array.from({ length: 7 }, (_, index) => timeMin + ((timeMax - timeMin) * index) / 6);
  const endpointLabels: EndpointLabel[] = [];
  const seriesPaths = series.map((item) => {
    const points = item.points.map((point) => ({ x: xScale(point.timestamp), y: yScale(point.score) }));
    const lastPoint = points[points.length - 1];

    if (lastPoint) {
      endpointLabels.push({
        series: item,
        x: lastPoint.x,
        y: lastPoint.y,
        labelY: lastPoint.y - 22,
      });
    }

    return { item, points, path: buildPath(points) };
  });
  const adjustedLabels = buildEndpointLabels(endpointLabels, plot.top, plotBottom);
  const tableStartY = 676;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#06100e"/>
      <stop offset="58%" stop-color="#11221d"/>
      <stop offset="100%" stop-color="#0a1412"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000000" flood-opacity="0.34"/>
    </filter>
    <style>
      .mono { font-family: "DejaVu Sans Mono"; }
      .sans { font-family: "DejaVu Sans"; }
    </style>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect x="30" y="30" width="${WIDTH - 60}" height="${HEIGHT - 60}" rx="22" fill="#0e1a17" stroke="#25463b" stroke-width="2" filter="url(#softShadow)"/>

  <text x="58" y="78" fill="#6aff9e" font-size="18" class="mono" font-weight="800" letter-spacing="3">CODING DATA OVERLAY</text>
  <text x="58" y="122" fill="#f4fff8" font-size="34" class="sans" font-weight="850">${escapeXml(title)}</text>
  <text x="58" y="155" fill="#a8bbb4" font-size="17" class="sans">7-axis coding / ${PERIOD_LABELS[period]} / focused Y-axis ${yMin}-${yMax} / fetched ${escapeXml(fetchedAt)}</text>
  <text x="${WIDTH - 330}" y="78" fill="#a8bbb4" font-size="16" class="mono">AI STUPID METER</text>
  <text x="${WIDTH - 330}" y="108" fill="${winner?.color || '#6aff9e'}" font-size="18" class="sans" font-weight="800">Best avg</text>
  <text x="${WIDTH - 330}" y="134" fill="${winner?.color || '#6aff9e'}" font-size="21" class="sans" font-weight="800">${escapeXml(winner?.name || '--')}</text>
  <text x="${WIDTH - 330}" y="161" fill="#f4fff8" font-size="18" class="mono">${winner ? `${formatNumber(winner.average, 1)} average score` : '--'}</text>

  ${series.map((item, index) => {
    const cardWidth = 312;
    const x = 58 + index * (cardWidth + 18);
    return `
  <rect x="${x}" y="182" width="${cardWidth}" height="70" rx="10" fill="#13231f" stroke="${item.color}" stroke-opacity="0.7" stroke-width="1.5"/>
  <text x="${x + 18}" y="209" fill="${item.color}" font-size="18" class="sans" font-weight="800">${escapeXml(item.name)}</text>
  <text x="${x + 18}" y="239" fill="#f4fff8" font-size="32" class="mono" font-weight="900">${formatNumber(item.current)}</text>
  <text x="${x + 96}" y="237" fill="#a8bbb4" font-size="15" class="mono">avg ${formatNumber(item.average, 1)}  Δ ${formatNumber(item.delta)}  pts ${item.points.length}</text>`;
  }).join('')}

  <rect x="${plot.left}" y="${plot.top}" width="${plot.width}" height="${plot.height}" rx="8" fill="#07110f" stroke="#28433a" stroke-width="1.5"/>
  <text x="52" y="${plot.top + 194}" fill="#d7e8e0" font-size="16" class="mono" font-weight="800" transform="rotate(-90 52 ${plot.top + 194})">CODING SCORE</text>

  ${yTicks.map((tick) => {
    const y = yScale(tick);
    return `
  <line x1="${plot.left}" y1="${y.toFixed(1)}" x2="${plotRight}" y2="${y.toFixed(1)}" stroke="#dcece0" stroke-opacity="0.16" stroke-dasharray="6 8"/>
  <text x="${plot.left - 18}" y="${(y + 5).toFixed(1)}" text-anchor="end" fill="#dcece0" fill-opacity="0.92" font-size="15" class="mono" font-weight="800">${tick}</text>`;
  }).join('')}

  ${xTickTimes.map((time) => {
    const x = plot.left + ((time - timeMin) / (timeMax - timeMin)) * plot.width;
    return `
  <line x1="${x.toFixed(1)}" y1="${plotBottom}" x2="${x.toFixed(1)}" y2="${plotBottom + 8}" stroke="#dcece0" stroke-opacity="0.45"/>
  <text x="${x.toFixed(1)}" y="${plotBottom + 32}" text-anchor="middle" fill="#a8bbb4" font-size="14" class="mono">${escapeXml(formatAxisTimestamp(new Date(time).toISOString(), period))}</text>`;
  }).join('')}

  ${seriesPaths.map(({ item, path, points }) => `
  <path d="${path}" fill="none" stroke="#020806" stroke-width="8" stroke-linejoin="round" stroke-linecap="round" opacity="0.62"/>
  <path d="${path}" fill="none" stroke="${item.color}" stroke-width="4.6" stroke-linejoin="round" stroke-linecap="round"/>
  ${points.filter((_, index) => index % Math.max(1, Math.ceil(points.length / 22)) === 0).map((point) => `
  <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.2" fill="${item.color}" stroke="#07110f" stroke-width="1.2"/>`).join('')}
  `).join('')}

  ${adjustedLabels.map(({ series: item, x, y, labelY }) => {
    const labelX = plotRight + 24;
    return `
  <line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${labelX - 8}" y2="${(labelY + 20).toFixed(1)}" stroke="${item.color}" stroke-width="2" stroke-opacity="0.8"/>
  <rect x="${labelX}" y="${labelY.toFixed(1)}" width="220" height="42" rx="7" fill="#07110f" stroke="${item.color}" stroke-width="1.7"/>
  <text x="${labelX + 12}" y="${(labelY + 17).toFixed(1)}" fill="${item.color}" font-size="14" class="sans" font-weight="800">${escapeXml(item.name)}</text>
  <text x="${labelX + 12}" y="${(labelY + 34).toFixed(1)}" fill="#dcece0" font-size="13" class="mono">current ${formatNumber(item.current)} / avg ${formatNumber(item.average, 1)}</text>`;
  }).join('')}

  <rect x="58" y="${tableStartY - 30}" width="882" height="150" rx="12" fill="#111f1b" stroke="#28433a"/>
  <text x="78" y="${tableStartY}" fill="#f4fff8" font-size="18" class="mono" font-weight="900">DATA COMPARISON</text>
  ${series.map((item, index) => {
    const y = tableStartY + 30 + index * 25;
    return `
  <circle cx="82" cy="${y - 5}" r="5" fill="${item.color}"/>
  <text x="98" y="${y}" fill="${item.color}" font-size="15" class="sans" font-weight="800">${escapeXml(item.name)}</text>
  <text x="356" y="${y}" fill="#dcece0" font-size="14" class="mono">current ${formatNumber(item.current)}</text>
  <text x="474" y="${y}" fill="#dcece0" font-size="14" class="mono">avg ${formatNumber(item.average, 1)}</text>
  <text x="570" y="${y}" fill="#dcece0" font-size="14" class="mono">range ${formatNumber(item.minimum)}-${formatNumber(item.maximum)}</text>
  <text x="692" y="${y}" fill="#dcece0" font-size="14" class="mono">runs ${formatNumber(item.totalRuns)}</text>
  <text x="790" y="${y}" fill="#dcece0" font-size="14" class="mono">${formatLatency(item.averageLatency)}</text>`;
  }).join('')}

  <rect x="968" y="${tableStartY - 30}" width="374" height="150" rx="12" fill="#111f1b" stroke="#28433a"/>
  <text x="990" y="${tableStartY}" fill="#a8bbb4" font-size="16" class="mono" font-weight="800">WHY THIS IMAGE</text>
  <text x="990" y="${tableStartY + 34}" fill="#f4fff8" font-size="20" class="sans" font-weight="800">One cron snapshot, four models</text>
  <text x="990" y="${tableStartY + 64}" fill="#dcece0" font-size="15" class="sans">Focused Y-axis exposes separation instead of</text>
  <text x="990" y="${tableStartY + 86}" fill="#dcece0" font-size="15" class="sans">flattening all coding lines into the same band.</text>
  <text x="990" y="${tableStartY + 116}" fill="#6aff9e" font-size="15" class="mono" font-weight="800">Generated by Vercel Cron</text>
</svg>`;

  const renderer = new Resvg(svg, getResvgOptions());

  return renderer.render().asPng();
}
