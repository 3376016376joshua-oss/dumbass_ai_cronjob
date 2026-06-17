import type { Metadata } from 'next';

import { fetchModelDetailSnapshots } from '@/lib/model-snapshot-cron';

import SnapshotComparisonClient from './SnapshotComparisonClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Model Comparison Snapshot | AI Stupid Meter',
};

const SNAPSHOT_MODEL_IDS = [256, 220, 250, 268];
const SNAPSHOT_PERIOD = '7d';

export default async function SnapshotComparePage() {
  try {
    const result = await fetchModelDetailSnapshots({ modelIds: SNAPSHOT_MODEL_IDS });
    return <SnapshotComparisonClient snapshots={result.snapshots} period={SNAPSHOT_PERIOD} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return (
      <div className="md-error">
        <div className="md-error-inner">
          <div className="md-error-title">COMPARISON SNAPSHOT NOT FOUND</div>
          <div className="md-error-icon">!</div>
          <div className="md-error-text">
            Could not fetch live coding snapshots for models {SNAPSHOT_MODEL_IDS.join(', ')}.
          </div>
          <div className="md-error-text" style={{ fontSize: '10px', color: 'var(--phosphor-dim)' }}>
            {message}
          </div>
        </div>
      </div>
    );
  }
}
