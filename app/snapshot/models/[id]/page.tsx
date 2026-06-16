import type { Metadata } from 'next';

import { readModelSnapshot } from '@/lib/snapshot-storage';

import '../../../../styles/model-detail-v4.css';
import SnapshotModelDetailClient from './SnapshotModelDetailClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Model Snapshot | AI Stupid Meter',
};

interface SnapshotModelPageProps {
  params: {
    id: string;
  };
}

export default async function SnapshotModelPage({ params }: SnapshotModelPageProps) {
  try {
    const snapshot = await readModelSnapshot(params.id);
    return <SnapshotModelDetailClient snapshot={snapshot} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return (
      <div className="md-error">
        <div className="md-error-inner">
          <div className="md-error-title">SNAPSHOT NOT FOUND</div>
          <div className="md-error-icon">!</div>
          <div className="md-error-text">
            Could not load local snapshot for model {params.id}.
          </div>
          <div className="md-error-text" style={{ fontSize: '10px', color: 'var(--phosphor-dim)' }}>
            {message}
          </div>
        </div>
      </div>
    );
  }
}
