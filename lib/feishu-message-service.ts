const DEFAULT_FEISHU_API_BASE_URL = 'https://open.feishu.cn';
const DEFAULT_UUID_PREFIX = 'aistupidmeter-feishu';
const SUPPORTED_RECEIVE_ID_TYPES = ['open_id', 'user_id', 'union_id', 'email', 'chat_id'] as const;

export type FeishuReceiveIdType = (typeof SUPPORTED_RECEIVE_ID_TYPES)[number];

type FeishuMessageConfig = {
  appId?: string;
  appSecret?: string;
  apiBaseUrl?: string;
  receiveId?: string;
  receiveIdType?: string;
  text?: string;
  uuid?: string;
  uuidPrefix?: string;
};

type SendConfiguredOptions = {
  dryRun?: boolean;
  receiveId?: string;
  receiveIdType?: string;
  text?: string;
  uuid?: string;
  now?: Date;
};

type FeishuApiErrorDetails = {
  endpoint: string;
  status?: number;
  code?: number;
  message?: string;
  response?: unknown;
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
      return value;
    }
  }

  return undefined;
}

function normalizeApiBaseUrl(raw?: string) {
  return (raw || DEFAULT_FEISHU_API_BASE_URL).replace(/\/$/, '');
}

function parseReceiveIdType(raw?: string): FeishuReceiveIdType {
  const value = (raw || 'chat_id').trim();

  if (!SUPPORTED_RECEIVE_ID_TYPES.includes(value as FeishuReceiveIdType)) {
    throw new Error(`Invalid Feishu receive id type "${value}". Expected one of: ${SUPPORTED_RECEIVE_ID_TYPES.join(', ')}`);
  }

  return value as FeishuReceiveIdType;
}

function getConfiguredMessageConfig(overrides: SendConfiguredOptions = {}): FeishuMessageConfig & Required<Pick<FeishuMessageConfig, 'apiBaseUrl' | 'receiveIdType' | 'uuid'>> {
  const now = overrides.now ?? new Date();
  const uuidPrefix = firstEnv(['FEISHU_MESSAGE_UUID_PREFIX', 'LARK_MESSAGE_UUID_PREFIX']) ?? DEFAULT_UUID_PREFIX;
  const receiveIdType = parseReceiveIdType(
    overrides.receiveIdType ?? firstEnv(['FEISHU_MESSAGE_RECEIVE_ID_TYPE', 'LARK_MESSAGE_RECEIVE_ID_TYPE']),
  );

  return {
    appId: firstEnv(['FEISHU_APP_ID', 'LARK_APP_ID']),
    appSecret: firstEnv(['FEISHU_APP_SECRET', 'LARK_APP_SECRET']),
    apiBaseUrl: normalizeApiBaseUrl(firstEnv(['FEISHU_API_BASE_URL', 'LARK_API_BASE_URL'])),
    receiveId: overrides.receiveId ?? firstEnv(['FEISHU_MESSAGE_RECEIVE_ID', 'LARK_MESSAGE_RECEIVE_ID']),
    receiveIdType,
    text: overrides.text ?? firstEnv(['FEISHU_SCHEDULED_MESSAGE_TEXT', 'FEISHU_MESSAGE_TEXT', 'LARK_SCHEDULED_MESSAGE_TEXT', 'LARK_MESSAGE_TEXT']),
    uuid: overrides.uuid ?? buildScheduledMessageUuid(uuidPrefix, now),
  };
}

function getMissingConfigFields(config: FeishuMessageConfig, requireCredentials: boolean) {
  const missing = [];

  if (requireCredentials && !config.appId) missing.push('FEISHU_APP_ID');
  if (requireCredentials && !config.appSecret) missing.push('FEISHU_APP_SECRET');
  if (!config.receiveId) missing.push('FEISHU_MESSAGE_RECEIVE_ID');
  if (!config.text) missing.push('FEISHU_SCHEDULED_MESSAGE_TEXT');

  return missing;
}

function assertConfig(config: FeishuMessageConfig, requireCredentials: boolean) {
  const missing = getMissingConfigFields(config, requireCredentials);

  if (missing.length > 0) {
    throw new Error(`Missing Feishu message configuration: ${missing.join(', ')}`);
  }
}

function buildScheduledMessageUuid(prefix: string, now: Date) {
  const slot = now.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48) || DEFAULT_UUID_PREFIX;

  return `${cleanPrefix}-${slot}`.slice(0, 64);
}

function buildTextMessagePayload(config: Required<Pick<FeishuMessageConfig, 'receiveId' | 'text' | 'uuid'>>) {
  return {
    receive_id: config.receiveId,
    msg_type: 'text',
    content: JSON.stringify({ text: config.text }),
    uuid: config.uuid,
  };
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

export function getFeishuScheduledMessageStatus() {
  const enabled = firstEnv(['FEISHU_SCHEDULED_MESSAGE_ENABLED', 'LARK_SCHEDULED_MESSAGE_ENABLED']) === '1';
  const config = getConfiguredMessageConfig();
  const missingForSend = getMissingConfigFields(config, true);

  return {
    enabled,
    configured: missingForSend.length === 0,
    missing: missingForSend,
    receiveIdType: config.receiveIdType,
    receiveIdConfigured: Boolean(config.receiveId),
    textConfigured: Boolean(config.text),
  };
}

export async function sendConfiguredFeishuMessage(options: SendConfiguredOptions = {}) {
  const dryRun = Boolean(options.dryRun);
  const config = getConfiguredMessageConfig(options);
  assertConfig(config, !dryRun);
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  const receiveIdType = parseReceiveIdType(config.receiveIdType);
  const messageEndpoint = `${apiBaseUrl}/open-apis/im/v1/messages?receive_id_type=${encodeURIComponent(receiveIdType)}`;
  const payload = buildTextMessagePayload({
    receiveId: config.receiveId!,
    text: config.text!,
    uuid: config.uuid,
  });

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      provider: 'feishu',
      receiveIdType,
      receiveId: config.receiveId,
      msgType: payload.msg_type,
      text: config.text,
      uuid: config.uuid,
      request: {
        tokenEndpoint: `${apiBaseUrl}/open-apis/auth/v3/tenant_access_token/internal`,
        messageEndpoint,
        body: payload,
      },
      credentials: {
        appIdConfigured: Boolean(config.appId),
        appSecretConfigured: Boolean(config.appSecret),
      },
    };
  }

  const token = await fetchTenantAccessToken({
    appId: config.appId!,
    appSecret: config.appSecret!,
    apiBaseUrl,
  });
  const response = await fetch(messageEndpoint, {
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
      endpoint: messageEndpoint,
      status: response.status,
      code: data?.code,
      message: data?.msg,
      response: data,
    });
  }

  return {
    ok: true,
    dryRun: false,
    provider: 'feishu',
    receiveIdType,
    receiveId: config.receiveId,
    msgType: payload.msg_type,
    uuid: config.uuid,
    message: data?.data ?? data,
  };
}

export function isFeishuScheduledMessageEnabled() {
  return firstEnv(['FEISHU_SCHEDULED_MESSAGE_ENABLED', 'LARK_SCHEDULED_MESSAGE_ENABLED']) === '1';
}
