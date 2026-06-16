import type { Metadata } from 'next';

import { readModelSnapshot } from '@/lib/snapshot-storage';

import '../../../styles/model-detail-v4.css';
import SnapshotComparisonClient from './SnapshotComparisonClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Model Comparison Snapshot | AI Stupid Meter',
};

const DEFAULT_MODEL_IDS = ['220', '250', '268'];
const PERIODS = new Set(['latest', '24h', '7d', '1m']);

interface SnapshotComparePageProps {
  searchParams?: {
    ids?: string;
    period?: string;
  };
}

function parseModelIds(raw?: string) {
  if (!raw) return DEFAULT_MODEL_IDS;

  const ids = raw
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return ids.length ? Array.from(new Set(ids)) : DEFAULT_MODEL_IDS;
}

function parsePeriod(raw?: string) {
  return PERIODS.has(raw || '') ? raw as 'latest' | '24h' | '7d' | '1m' : '7d';
}

export default async function SnapshotComparePage({ searchParams }: SnapshotComparePageProps) {
  const modelIds = parseModelIds(searchParams?.ids);
  const period = parsePeriod(searchParams?.period);

  try {
    const snapshots = await Promise.all(modelIds.map(readModelSnapshot));
    return <SnapshotComparisonClient snapshots={snapshots} period={period} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return (
      <div className="md-error">
        <div className="md-error-inner">
          <div className="md-error-title">COMPARISON SNAPSHOT NOT FOUND</div>
          <div className="md-error-icon">!</div>
          <div className="md-error-text">
            Could not load local snapshots for models {modelIds.join(', ')}.
          </div>
          <div className="md-error-text" style={{ fontSize: '10px', color: 'var(--phosphor-dim)' }}>
            {message}
          </div>
        </div>
      </div>
    );
  }
}
