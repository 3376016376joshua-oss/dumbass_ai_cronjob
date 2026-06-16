import { NextRequest, NextResponse } from 'next/server';

import {
  FeishuApiError,
  getFeishuScheduledMessageStatus,
  isFeishuScheduledMessageEnabled,
  sendConfiguredFeishuMessage,
} from '@/lib/feishu-message-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }

  return request.headers.get('authorization') === `Bearer ${secret}`;
}

function isTruthy(value: string | null) {
  return value === '1' || value === 'true' || value === 'yes';
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = isTruthy(request.nextUrl.searchParams.get('dryRun'));

  if (!dryRun && !isFeishuScheduledMessageEnabled()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'FEISHU_SCHEDULED_MESSAGE_ENABLED is not set to 1',
      status: getFeishuScheduledMessageStatus(),
    });
  }

  try {
    const result = await sendConfiguredFeishuMessage({
      dryRun,
      receiveId: request.nextUrl.searchParams.get('receiveId') ?? undefined,
      receiveIdType: request.nextUrl.searchParams.get('receiveIdType') ?? undefined,
      text: request.nextUrl.searchParams.get('text') ?? undefined,
      uuid: request.nextUrl.searchParams.get('uuid') ?? undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[cron/send-feishu-message] failed', error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        details: error instanceof FeishuApiError ? error.details : undefined,
      },
      { status: 500 },
    );
  }
}
