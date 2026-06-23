import { renderSnapshotComparisonPng } from './snapshot-comparison-image';

const DEFAULT_FEISHU_API_BASE_URL = 'https://open.feishu.cn';
const DEFAULT_SITE_URL = 'https://dumbass-ai-cronjob.vercel.app';
const DEFAULT_UUID_PREFIX = 'aistupidmeter-snapshot';
const SUPPORTED_RECEIVE_ID_TYPES = ['open_id', 'user_id', 'union_id', 'email', 'chat_id'] as const;

type FeishuReceiveIdType = (typeof SUPPORTED_RECEIVE_ID_TYPES)[number];

type FeishuMessageConfig = {
  appId?: string;
  appSecret?: string;
  apiBaseUrl: string;
  receiveId?: string;
  receiveIdType: FeishuReceiveIdType;
  siteUrl: string;
  uuidPrefix: string;
  sendImage: boolean;
};

type FeishuApiErrorDetails = {
  endpoint: string;
  status?: number;
  code?: number;
  message?: string;
  response?: unknown;
};

type ModelSummary = {
  id: number | string | undefined;
  name: string;
  current: number | null;
  average: number | null;
  delta: number | null;
  minimum: number | null;
  maximum: number | null;
  runs: number | null;
  successRate: number | null;
  averageLatency: number | null;
};

export class FeishuApiError extends Error {
  details: FeishuApiErrorDetails;

  constructor(message: string, details: FeishuApiErrorDetails) {
    super(message);
    this.name = 'FeishuApiError';
    this.details = details;
  }
}

function firstEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function isTruthy(value?: string) {
  return value === '1' || value === 'true' || value === 'yes';
}

function isFalsey(value?: string) {
  return value === '0' || value === 'false' || value === 'no';
}

function normalizeBaseUrl(raw?: string) {
  return (raw || DEFAULT_FEISHU_API_BASE_URL).replace(/\/$/, '');
}

function normalizeSiteUrl(raw?: string) {
  const value = (raw || DEFAULT_SITE_URL).trim();

  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return value.replace(/\/$/, '');
  }
}

function parseReceiveIdType(raw?: string): FeishuReceiveIdType {
  const value = raw || 'chat_id';

  if (!SUPPORTED_RECEIVE_ID_TYPES.includes(value as FeishuReceiveIdType)) {
    throw new Error(`Invalid Feishu receive id type "${value}". Expected one of: ${SUPPORTED_RECEIVE_ID_TYPES.join(', ')}`);
  }

  return value as FeishuReceiveIdType;
}

function getFeishuMessageConfig(): FeishuMessageConfig {
  const sendImage = firstEnv(['FEISHU_SEND_IMAGE', 'LARK_SEND_IMAGE']);

  return {
    appId: firstEnv(['FEISHU_APP_ID', 'LARK_APP_ID']),
    appSecret: firstEnv(['FEISHU_APP_SECRET', 'LARK_APP_SECRET']),
    apiBaseUrl: normalizeBaseUrl(firstEnv(['FEISHU_API_BASE_URL', 'LARK_API_BASE_URL'])),
    receiveId: firstEnv(['FEISHU_MESSAGE_RECEIVE_ID', 'LARK_MESSAGE_RECEIVE_ID']),
    receiveIdType: parseReceiveIdType(firstEnv(['FEISHU_MESSAGE_RECEIVE_ID_TYPE', 'LARK_MESSAGE_RECEIVE_ID_TYPE'])),
    siteUrl: normalizeSiteUrl(firstEnv([
      'FEISHU_SITE_URL',
      'FEISHU_SNAPSHOT_COMPARE_URL',
      'SNAPSHOT_COMPARE_URL',
      'NEXT_PUBLIC_SITE_URL',
    ])),
    uuidPrefix: firstEnv(['FEISHU_MESSAGE_UUID_PREFIX', 'LARK_MESSAGE_UUID_PREFIX']) || DEFAULT_UUID_PREFIX,
    sendImage: !isFalsey(sendImage),
  };
}

function getMissingConfigFields(config: FeishuMessageConfig) {
  const missing = [];

  if (!config.appId) missing.push('FEISHU_APP_ID');
  if (!config.appSecret) missing.push('FEISHU_APP_SECRET');
  if (!config.receiveId) missing.push('FEISHU_MESSAGE_RECEIVE_ID');

  return missing;
}

function buildUuid(prefix: string, now = new Date(), suffix?: string) {
  const slot = now.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48) || DEFAULT_UUID_PREFIX;
  const cleanSuffix = suffix ? `-${suffix.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 12)}` : '';

  return `${cleanPrefix}-${slot}${cleanSuffix}`.slice(0, 64);
}

function toDisplayScore(point: any): number | null {
  if (!point) return null;
  const value = typeof point.score === 'number'
    ? point.score
    : typeof point.displayScore === 'number'
      ? point.displayScore
      : typeof point.currentScore === 'number'
        ? point.currentScore
        : typeof point.stupidScore === 'number'
          ? point.stupidScore
          : null;

  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function formatNumber(value: number | null, digits = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--';
}

function formatLatency(value: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

function sortByCodingRecommendation(a: ModelSummary, b: ModelSummary) {
  const currentDelta = (b.current ?? -Infinity) - (a.current ?? -Infinity);
  if (currentDelta !== 0) return currentDelta;

  const averageDelta = (b.average ?? -Infinity) - (a.average ?? -Infinity);
  if (averageDelta !== 0) return averageDelta;

  return (a.averageLatency ?? Infinity) - (b.averageLatency ?? Infinity);
}

function getBestCodingAgent(summaries: ModelSummary[]) {
  return [...summaries]
    .filter((item) => typeof item.current === 'number' || typeof item.average === 'number')
    .sort(sortByCodingRecommendation)[0] || null;
}

function getDegradedModels(summaries: ModelSummary[]) {
  const degraded = summaries.filter((item) => {
    const currentBelowAverage =
      typeof item.current === 'number'
      && typeof item.average === 'number'
      && item.current <= item.average - 8;
    const sharpDrop = typeof item.delta === 'number' && item.delta <= -10;

    return currentBelowAverage || sharpDrop;
  });

  if (degraded.length > 0) {
    return degraded.sort((a, b) => (a.current ?? 101) - (b.current ?? 101));
  }

  return [...summaries]
    .filter((item) => typeof item.current === 'number')
    .sort((a, b) => (a.current ?? 101) - (b.current ?? 101))
    .slice(0, 1);
}

function modelName(snapshot: any) {
  const model = snapshot?.model?.data || {};
  return model.displayName || model.name || `model-${snapshot?.modelId || 'unknown'}`;
}

function buildModelSummaries(snapshotResult: any) {
  const snapshots = Array.isArray(snapshotResult?.detail?.snapshots) ? snapshotResult.detail.snapshots : [];

  return snapshots.map((snapshot: any): ModelSummary => {
    const rawHistory = snapshot?.snapshots?.speed?.['7d']?.history?.data?.data;
    const stats = snapshot?.snapshots?.speed?.['7d']?.stats?.data || {};
    const points = Array.isArray(rawHistory)
      ? rawHistory
        .map(toDisplayScore)
        .filter((score: number | null): score is number => typeof score === 'number')
        .reverse()
      : [];
    const first = points[0] ?? null;
    const current = points[points.length - 1] ?? null;
    const average = points.length ? points.reduce((sum, score) => sum + score, 0) / points.length : null;
    const minimum = points.length ? Math.min(...points) : null;
    const maximum = points.length ? Math.max(...points) : null;

    return {
      id: snapshot?.modelId,
      name: modelName(snapshot),
      current,
      average,
      delta: typeof first === 'number' && typeof current === 'number' ? current - first : null,
      minimum,
      maximum,
      runs: typeof stats.totalRuns === 'number' && stats.totalRuns > 0 ? stats.totalRuns : points.length,
      successRate: typeof stats.successRate === 'number' ? stats.successRate : null,
      averageLatency: typeof stats.averageLatency === 'number' ? stats.averageLatency : null,
    };
  });
}

function buildMessageText(
  snapshotResult: any,
  siteUrl: string,
) {
  const summaries: ModelSummary[] = buildModelSummaries(snapshotResult);
  const fetchedAt = snapshotResult?.fetchedAt ? new Date(snapshotResult.fetchedAt) : new Date();
  const best = [...summaries]
    .filter((item): item is ModelSummary & { average: number } => typeof item.average === 'number')
    .sort((a, b) => (b.average || 0) - (a.average || 0))[0];
  const bestCodingAgent = getBestCodingAgent(summaries);
  const degradedModels = getDegradedModels(summaries);

  const lines = [
    'AI Stupid Meter coding 日报',
    `时间: ${fetchedAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
    '周期: 7D / 模式: 7-axis coding',
    '',
    `今日最佳 Coding Agent: ${bestCodingAgent ? `${bestCodingAgent.name} (current ${formatNumber(bestCodingAgent.current)}, avg ${formatNumber(bestCodingAgent.average, 1)})` : '--'}`,
    `使用建议: 优先交给 ${bestCodingAgent?.name || '当前最高分模型'} 处理复杂代码改动、跨文件重构、测试修复；低分模型只做窄范围检查或候选方案。`,
    '',
    '模型数据:',
    ...summaries.map((item) => (
      `${item.name}: current ${formatNumber(item.current)}, avg ${formatNumber(item.average, 1)}, Δ ${formatNumber(item.delta)}, range ${formatNumber(item.minimum)}-${formatNumber(item.maximum)}, runs ${formatNumber(item.runs)}, success ${formatNumber(item.successRate, 1)}%, latency ${formatLatency(item.averageLatency)}`
    )),
    '',
    `7D best avg: ${best ? `${best.name} (${formatNumber(best.average, 1)})` : '--'}`,
    '',
    '降智模型提示词加固:',
    ...degradedModels.map((item) => (
      `${item.name}: current ${formatNumber(item.current)}, Δ ${formatNumber(item.delta)}。提示词请加: "先列出相关文件和证据；每一步只做一个小改动；输出失败假设、测试命令、回滚点；不要省略边界条件。"`
    )),
    '通用加固: 对低分模型减少开放式要求，多给输入/输出格式、验收标准、禁止事项和最小改动范围。',
    '',
    `项目链接: ${siteUrl}`,
  ];

  return lines.join('\n');
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (error) {
    return {
      parseError: error instanceof Error ? error.message : String(error),
      raw: text.slice(0, 1000),
    };
  }
}

async function fetchTenantAccessToken(config: Required<Pick<FeishuMessageConfig, 'appId' | 'appSecret' | 'apiBaseUrl'>>) {
  const endpoint = `${config.apiBaseUrl}/open-apis/auth/v3/tenant_access_token/internal`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await readJsonResponse(response) as any;

  if (!response.ok || data?.code !== 0 || !data?.tenant_access_token) {
    throw new FeishuApiError('Failed to fetch Feishu tenant access token', {
      endpoint,
      status: response.status,
      code: data?.code,
      message: data?.msg,
      response: data,
    });
  }

  return data.tenant_access_token as string;
}

async function postFeishuMessage(
  config: FeishuMessageConfig,
  token: string,
  msgType: 'text' | 'image',
  content: Record<string, unknown>,
  uuidSuffix: string,
) {
  const endpoint = `${config.apiBaseUrl}/open-apis/im/v1/messages?receive_id_type=${encodeURIComponent(config.receiveIdType)}`;
  const payload = {
    receive_id: config.receiveId,
    msg_type: msgType,
    content: JSON.stringify(content),
    uuid: buildUuid(config.uuidPrefix, new Date(), uuidSuffix),
  };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const data = await readJsonResponse(response) as any;

  if (!response.ok || data?.code !== 0) {
    throw new FeishuApiError('Failed to send Feishu message', {
      endpoint,
      status: response.status,
      code: data?.code,
      message: data?.msg,
      response: data,
    });
  }

  return data?.data ?? data;
}

async function uploadFeishuImage(
  config: FeishuMessageConfig,
  token: string,
  png: Uint8Array,
) {
  const endpoint = `${config.apiBaseUrl}/open-apis/im/v1/images`;
  const form = new FormData();
  const imageBytes = new Uint8Array(png);

  form.append('image_type', 'message');
  form.append('image', new Blob([imageBytes], { type: 'image/png' }), 'aistupidmeter-coding-compare.png');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: form,
    signal: AbortSignal.timeout(20000),
  });
  const data = await readJsonResponse(response) as any;

  if (!response.ok || data?.code !== 0 || !data?.data?.image_key) {
    throw new FeishuApiError('Failed to upload Feishu image', {
      endpoint,
      status: response.status,
      code: data?.code,
      message: data?.msg,
      response: data,
    });
  }

  return data.data.image_key as string;
}

async function sendTextMessage(config: FeishuMessageConfig, text: string) {
  const missing = getMissingConfigFields(config);
  if (missing.length > 0) {
    return {
      ok: false,
      skipped: true,
      reason: `Missing Feishu message configuration: ${missing.join(', ')}`,
      missing,
    };
  }

  const token = await fetchTenantAccessToken({
    appId: config.appId!,
    appSecret: config.appSecret!,
    apiBaseUrl: config.apiBaseUrl,
  });
  const message = await postFeishuMessage(config, token, 'text', { text }, 'text');

  return {
    ok: true,
    skipped: false,
    receiveIdType: config.receiveIdType,
    receiveId: config.receiveId,
    message,
  };
}

async function sendSnapshotImageNotification(config: FeishuMessageConfig, snapshotResult: any) {
  const missing = getMissingConfigFields(config);
  if (missing.length > 0) {
    return {
      ok: false,
      skipped: true,
      reason: `Missing Feishu message configuration: ${missing.join(', ')}`,
      missing,
    };
  }

  const token = await fetchTenantAccessToken({
    appId: config.appId!,
    appSecret: config.appSecret!,
    apiBaseUrl: config.apiBaseUrl,
  });
  const text = buildMessageText(snapshotResult, config.siteUrl);
  const png = await renderSnapshotComparisonPng(snapshotResult, '7d');
  const imageKey = await uploadFeishuImage(config, token, png);
  const textMessage = await postFeishuMessage(config, token, 'text', { text }, 'text');
  const imageMessage = await postFeishuMessage(config, token, 'image', { image_key: imageKey }, 'image');

  return {
    ok: true,
    skipped: false,
    receiveIdType: config.receiveIdType,
    receiveId: config.receiveId,
    imageKey,
    textMessage,
    imageMessage,
  };
}

export function isFeishuSnapshotNotificationEnabled() {
  return isTruthy(firstEnv(['FEISHU_SCHEDULED_MESSAGE_ENABLED', 'LARK_SCHEDULED_MESSAGE_ENABLED']));
}

export async function maybeSendFeishuSnapshotNotification(snapshotResult: any) {
  if (!isFeishuSnapshotNotificationEnabled()) {
    return {
      ok: true,
      skipped: true,
      reason: 'FEISHU_SCHEDULED_MESSAGE_ENABLED is not set to 1',
    };
  }

  const config = getFeishuMessageConfig();
  if (config.sendImage) {
    return sendSnapshotImageNotification(config, snapshotResult);
  }

  const text = buildMessageText(snapshotResult, config.siteUrl);
  return sendTextMessage(config, text);
}
