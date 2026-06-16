'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { TopBar, V4Footer } from '../../../../components/v4';
import ModelDetailHeader from '../../../../components/model-detail/ModelDetailHeader';
import ModelDetailStatBar from '../../../../components/model-detail/ModelDetailStatBar';
import ModelDetailMeter from '../../../../components/model-detail/ModelDetailMeter';
import ModelDetailChart from '../../../../components/model-detail/ModelDetailChart';

type HistoricalPeriod = 'latest' | '24h' | '7d' | '1m';
type ScoringMode = 'combined' | 'reasoning' | 'speed' | 'tooling';

interface HistoryPoint {
  timestamp: string;
  stupidScore: number;
  displayScore?: number;
  score?: number;
  axes: Record<string, number>;
}

interface SnapshotModelDetailClientProps {
  snapshot: any;
}

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

const getStatusFromScore = (score: number): string => {
  if (score >= 80) return 'excellent';
  if (score >= 65) return 'good';
  if (score >= 40) return 'warning';
  return 'critical';
};

const getTrendFromHistory = (history: HistoryPoint[]): string => {
  if (!history || history.length < 2) return 'stable';

  const scores = history
    .map((point) => toDisplayScore(point))
    .filter((score): score is number => typeof score === 'number');

  if (scores.length < 2) return 'stable';

  const recent = scores.slice(0, 3);
  const older = scores.slice(3, 6);
  if (older.length === 0) return 'stable';

  const recentAvg = recent.reduce((sum, score) => sum + score, 0) / recent.length;
  const olderAvg = older.reduce((sum, score) => sum + score, 0) / older.length;

  if (recentAvg > olderAvg + 5) return 'up';
  if (recentAvg < olderAvg - 5) return 'down';
  return 'stable';
};

const formatTimeAgo = (dateStr: string): string => {
  if (!dateStr) return 'Unknown';

  const date = new Date(dateStr);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
};

const normalizeAxes = (axes: any) => {
  if (!axes) return null;

  return {
    correctness: axes.correctness || 0,
    spec: axes.spec ?? axes.complexity ?? 0,
    codeQuality: axes.codeQuality || 0,
    efficiency: axes.efficiency || 0,
    stability: axes.stability || 0,
    refusal: axes.refusal ?? axes.edgeCases ?? 0,
    recovery: axes.recovery ?? axes.debugging ?? 0,
  };
};

const calculatePeriodAxes = (history: HistoryPoint[]) => {
  if (!history || history.length === 0) return null;

  const totals = {
    correctness: 0,
    spec: 0,
    codeQuality: 0,
    efficiency: 0,
    stability: 0,
    refusal: 0,
    recovery: 0,
  };

  let validPoints = 0;

  history.forEach((point) => {
    const axes = normalizeAxes(point.axes);
    if (!axes) return;

    totals.correctness += axes.correctness;
    totals.spec += axes.spec;
    totals.codeQuality += axes.codeQuality;
    totals.efficiency += axes.efficiency;
    totals.stability += axes.stability;
    totals.refusal += axes.refusal;
    totals.recovery += axes.recovery;
    validPoints += 1;
  });

  if (validPoints === 0) return null;

  return {
    correctness: totals.correctness / validPoints,
    spec: totals.spec / validPoints,
    codeQuality: totals.codeQuality / validPoints,
    efficiency: totals.efficiency / validPoints,
    stability: totals.stability / validPoints,
    refusal: totals.refusal / validPoints,
    recovery: totals.recovery / validPoints,
  };
};

const mapHistory = (rawHistory: any): HistoryPoint[] => {
  const data = rawHistory?.data?.data;
  if (!Array.isArray(data)) return [];

  return data.map((point: any) => ({
    timestamp: point.timestamp || new Date().toISOString(),
    stupidScore: point.stupidScore ?? point.score ?? 0,
    displayScore: point.score ?? point.displayScore ?? toDisplayScore(point) ?? 0,
    score: point.score,
    axes: point.axes || {},
  }));
};

const periods: Array<{ key: HistoricalPeriod; label: string }> = [
  { key: 'latest', label: 'LATEST' },
  { key: '24h', label: '24H' },
  { key: '7d', label: '7D' },
  { key: '1m', label: '1M' },
];

function SnapshotPeriodControls({
  selectedPeriod,
  onPeriodChange,
}: {
  selectedPeriod: HistoricalPeriod;
  onPeriodChange: (period: HistoricalPeriod) => void;
}) {
  return (
    <div className="md-controls">
      <span className="md-ctrl-label">Period</span>
      <div className="md-ctrl-group">
        {periods.map((period) => (
          <button
            key={period.key}
            className={`md-ctrl-btn ${selectedPeriod === period.key ? 'active' : ''}`}
            onClick={() => onPeriodChange(period.key)}
          >
            {period.label}
          </button>
        ))}
      </div>
      <div className="md-ctrl-sep" />
      <span className="md-ctrl-label">Mode</span>
      <div className="md-ctrl-group">
        <button className="md-ctrl-btn active">CODING</button>
      </div>
      <div className="md-ctrl-right">
        <span style={{ fontSize: '10px', color: 'var(--phosphor-dim)' }}>
          LOCAL SNAPSHOT
        </span>
      </div>
    </div>
  );
}

export default function SnapshotModelDetailClient({ snapshot }: SnapshotModelDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedPeriod, setSelectedPeriod] = useState<HistoricalPeriod>('latest');
  const selectedScoringMode: ScoringMode = 'speed';
  const [autoRefresh, setAutoRefresh] = useState(false);
  const exportMode = searchParams.get('capture') === '1';

  const modelDetails = snapshot?.model?.data || {};
  const visitorStats = snapshot?.visitorsStats?.data || {};
  const currentSnapshot = snapshot?.snapshots?.[selectedScoringMode]?.[selectedPeriod];

  const history = useMemo(() => mapHistory(currentSnapshot?.history), [currentSnapshot]);
  const stats = currentSnapshot?.stats?.data || {};

  const currentScore = useMemo(() => {
    const latest = history[0];
    const fromHistory = toDisplayScore(latest);
    if (fromHistory !== null) return fromHistory;

    const fromStats = toDisplayScore(stats);
    if (fromStats !== null) return fromStats;

    return toDisplayScore(modelDetails?.latestScore) || 0;
  }, [history, modelDetails, stats]);

  const status = getStatusFromScore(currentScore);
  const trend = getTrendFromHistory(history);
  const lastUpdated = history[0]?.timestamp || modelDetails?.latestScore?.ts || snapshot?.fetchedAt;
  const lastUpdatedStr = lastUpdated ? formatTimeAgo(lastUpdated) : 'Unknown';
  const axesData = calculatePeriodAxes(history) || normalizeAxes(modelDetails?.latestScore?.axes);

  const todayVisits = typeof visitorStats?.today?.visits === 'number' ? visitorStats.today.visits : null;
  const totalVisits = typeof visitorStats?.totals?.visits === 'number' ? visitorStats.totals.visits : null;

  return (
    <div className={exportMode ? 'md-snapshot-capture' : undefined}>
      <TopBar
        selectedView="dashboard"
        onViewChange={(view) => {
          if (view === 'about') router.push('/about');
          else if (view === 'faq') router.push('/faq');
          else router.push('/');
        }}
        visitorCount={totalVisits}
        todayVisits={todayVisits}
      />

      <ModelDetailHeader
        modelName={modelDetails.name || `model-${snapshot?.modelId || ''}`}
        displayName={modelDetails.displayName}
        provider={modelDetails.vendor || 'unknown'}
        status={status}
        trend={trend}
        lastUpdated={lastUpdatedStr}
        autoRefresh={autoRefresh}
        isRefreshing={false}
        onToggleAutoRefresh={() => setAutoRefresh((value) => !value)}
        onRefresh={() => window.location.reload()}
      />

      <ModelDetailStatBar
        currentScore={currentScore}
        status={status}
        totalRuns={stats?.totalRuns || 0}
        successRate={stats?.successRate || 0}
        averageLatency={stats?.averageLatency || 0}
        averageCorrectness={stats?.averageCorrectness || 0}
        lastUpdated={lastUpdatedStr}
      />

      <SnapshotPeriodControls
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
      />

      <ModelDetailMeter currentScore={currentScore} trend={trend} status={status} />

      <ModelDetailChart
        history={history}
        selectedPeriod={selectedPeriod}
        selectedScoringMode={selectedScoringMode}
        onSwitchPeriod={setSelectedPeriod}
        exportMode={exportMode}
      />

      <V4Footer visitorCount={totalVisits} />
    </div>
  );
}
