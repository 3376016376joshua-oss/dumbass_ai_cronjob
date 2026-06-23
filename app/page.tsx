import type { Metadata } from 'next';

import { fetchModelDetailSnapshots } from '@/lib/model-snapshot-cron';

import HomeSummaryClient from './HomeSummaryClient';

type HistoricalPeriod = 'latest' | '24h' | '7d' | '1m';

type HomeSearchParams = {
  ids?: string | string[];
  period?: string | string[];
};

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AI Model Snapshot Dashboard | AI Stupid Meter',
};

const DEFAULT_MODEL_IDS = [256, 220, 250, 268];
const DEFAULT_PERIOD: HistoricalPeriod = '7d';
const VALID_PERIODS = new Set<HistoricalPeriod>(['latest', '24h', '7d', '1m']);

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function parseModelIds(raw?: string) {
  if (!raw) return DEFAULT_MODEL_IDS;

  const ids = raw
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number(part));

  if (ids.length === 0 || ids.some((id) => !Number.isInteger(id))) {
    return DEFAULT_MODEL_IDS;
  }

  return Array.from(new Set(ids));
}

function parsePeriod(raw?: string): HistoricalPeriod {
  if (raw && VALID_PERIODS.has(raw as HistoricalPeriod)) {
    return raw as HistoricalPeriod;
  }

  return DEFAULT_PERIOD;
}

export default async function Home({ searchParams }: { searchParams?: HomeSearchParams }) {
  const modelIds = parseModelIds(firstParam(searchParams?.ids));
  const period = parsePeriod(firstParam(searchParams?.period));

  try {
    const result = await fetchModelDetailSnapshots({ modelIds });

    return (
      <HomeSummaryClient
        snapshots={result.snapshots}
        modelIds={modelIds}
        period={period}
      />
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return (
      <main className="md-comparison-page">
        <section className="md-comparison-panel">
          <div className="md-error">
            <div className="md-error-inner">
              <div className="md-error-title">DASHBOARD DATA NOT FOUND</div>
              <div className="md-error-icon">!</div>
              <div className="md-error-text">
                Could not fetch live coding snapshots for models {modelIds.join(', ')}.
              </div>
              <div className="md-error-text" style={{ fontSize: '10px', color: 'var(--phosphor-dim)' }}>
                {message}
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }
}
