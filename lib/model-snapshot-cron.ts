const PERIODS = ['latest', '24h', '7d', '1m'] as const;
const CODING_MODE = { key: 'speed', label: 'coding', sortBy: '7axis' };
const DEFAULT_MODEL_IDS = [256, 220, 250, 268];

type ModelIdSource = {
  raw?: string | null;
  source?: string;
};

function parseModelIds({ raw, source = 'MODEL_IDS/default' }: ModelIdSource = {}) {
  const ids = String(raw ?? DEFAULT_MODEL_IDS.join(','))
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number(part));

  if (ids.length === 0 || ids.some((id) => !Number.isInteger(id))) {
    throw new Error(`Invalid model ids from ${source}: ${raw}`);
  }

  return Array.from(new Set(ids));
}

function normalizeBaseUrl(raw?: string | null) {
  return (raw || 'https://aistupidlevel.info').replace(/\/$/, '');
}

async function requestJson(url: string, userAgent: string) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'user-agent': userAgent,
    },
    signal: AbortSignal.timeout(15000),
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = {
      parseError: error instanceof Error ? error.message : String(error),
      raw: text.slice(0, 1000),
    };
  }

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url,
    data,
  };
}

function buildModeSnapshotIndex(entries: Array<{ modeKey: string; period: string; value: unknown }>) {
  const result: Record<string, Record<string, unknown>> = {};

  for (const { modeKey, period, value } of entries) {
    if (!result[modeKey]) result[modeKey] = {};
    result[modeKey][period] = value;
  }

  return result;
}

export function resolveCronModelIds(raw?: string | null) {
  return parseModelIds({
    raw: raw ?? process.env.MODEL_IDS ?? process.env.MODEL_ID,
    source: raw ? 'request' : process.env.MODEL_IDS ? 'MODEL_IDS' : 'MODEL_ID/default',
  });
}

export async function fetchLatestScoreSnapshots(options: {
  modelIds?: number[];
  baseUrl?: string;
} = {}) {
  const modelIds = options.modelIds ?? resolveCronModelIds();
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.AISTUPIDLEVEL_BASE_URL);

  const records = [];

  for (const modelId of modelIds) {
    const sourceUrl = `${baseUrl}/api/models/${modelId}`;
    const modelResponse = await requestJson(sourceUrl, 'aistupidmeter-cron/1.0');

    if (!modelResponse.ok) {
      throw new Error(`Request failed for ${sourceUrl}: ${modelResponse.status} ${modelResponse.statusText}`);
    }

    const model = modelResponse.data as any;
    const latestScore = model?.latestScore ?? null;
    const score = latestScore?.displayScore ?? latestScore?.stupidScore ?? null;

    records.push({
      fetchedAt: new Date().toISOString(),
      modelId,
      modelName: model?.name ?? null,
      displayName: model?.displayName ?? null,
      vendor: model?.vendor ?? null,
      score,
      latestScore,
      sourceUrl,
    });
  }

  const storage = {
    backend: 'memory' as const,
    path: null,
  };

  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    modelIds,
    scores: records.map((record) => ({
      modelId: record.modelId,
      modelName: record.modelName,
      displayName: record.displayName,
      score: record.score,
    })),
    records,
    storage,
  };
}

export async function fetchModelDetailSnapshots(options: {
  modelIds?: number[];
  baseUrl?: string;
} = {}) {
  const modelIds = options.modelIds ?? resolveCronModelIds();
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.AISTUPIDLEVEL_BASE_URL);
  const visitorsUrl = `${baseUrl}/visitors/stats`;
  const visitorsResponse = await requestJson(visitorsUrl, 'aistupidmeter-model-detail-snapshot/1.0');

  async function fetchModelSnapshot(modelId: number) {
    const modelUrl = `${baseUrl}/api/models/${modelId}`;
    const [modelResponse, ...comboResponses] = await Promise.all([
      requestJson(modelUrl, 'aistupidmeter-model-detail-snapshot/1.0'),
      ...PERIODS.map(async (period) => {
        const historyUrl = `${baseUrl}/dashboard/history/${modelId}?period=${encodeURIComponent(period)}&sortBy=${encodeURIComponent(CODING_MODE.sortBy)}`;
        const statsUrl = `${baseUrl}/api/models/${modelId}/stats?period=${encodeURIComponent(period)}&sortBy=${encodeURIComponent(CODING_MODE.sortBy)}`;

        const [historyResponse, statsResponse] = await Promise.all([
          requestJson(historyUrl, 'aistupidmeter-model-detail-snapshot/1.0'),
          requestJson(statsUrl, 'aistupidmeter-model-detail-snapshot/1.0'),
        ]);

        return {
          modeKey: CODING_MODE.key,
          period,
          value: {
            sortBy: CODING_MODE.sortBy,
            label: CODING_MODE.label,
            history: {
              ok: historyResponse.ok,
              status: historyResponse.status,
              url: historyUrl,
              data: historyResponse.data,
            },
            stats: {
              ok: statsResponse.ok,
              status: statsResponse.status,
              url: statsUrl,
              data: statsResponse.data,
            },
          },
        };
      }),
    ]);

    if (!modelResponse.ok) {
      throw new Error(`Failed to fetch model details (${modelResponse.status} ${modelResponse.statusText}) from ${modelUrl}`);
    }

    const snapshot = {
      fetchedAt: new Date().toISOString(),
      sourceBaseUrl: baseUrl,
      modelPageUrl: `${baseUrl}/models/${modelId}`,
      modelId,
      model: {
        ok: modelResponse.ok,
        status: modelResponse.status,
        url: modelUrl,
        data: modelResponse.data,
      },
      visitorsStats: {
        ok: visitorsResponse.ok,
        status: visitorsResponse.status,
        url: visitorsUrl,
        data: visitorsResponse.data,
      },
      periods: PERIODS,
      scoringModes: [CODING_MODE],
      snapshotKind: 'coding-only',
      snapshots: buildModeSnapshotIndex(comboResponses),
      summary: {
        historyRequests: comboResponses.length,
        historyOk: comboResponses.filter((entry) => entry.value.history.ok).length,
        statsOk: comboResponses.filter((entry) => entry.value.stats.ok).length,
      },
    };

    const modelData = modelResponse.data as any;

    return {
      fetchedAt: snapshot.fetchedAt,
      modelId,
      modelName: modelData?.name ?? null,
      displayName: modelData?.displayName ?? null,
      storage: { backend: 'memory' as const, path: null },
      historyRequests: snapshot.summary.historyRequests,
      historyOk: snapshot.summary.historyOk,
      statsOk: snapshot.summary.statsOk,
      snapshot,
    };
  }

  const models = [];
  for (const id of modelIds) {
    models.push(await fetchModelSnapshot(id));
  }

  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    modelIds,
    storageBackend: 'memory' as const,
    models: models.map(({ snapshot, ...model }) => model),
    snapshots: models.map((model) => model.snapshot),
  };
}

export async function fetchModelSnapshots(options: {
  modelIds?: number[];
  baseUrl?: string;
} = {}) {
  const modelIds = options.modelIds ?? resolveCronModelIds();
  const baseUrl = options.baseUrl ?? process.env.AISTUPIDLEVEL_BASE_URL;

  const detail = await fetchModelDetailSnapshots({ modelIds, baseUrl });

  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    modelIds,
    storageBackend: 'memory' as const,
    detail,
  };
}
