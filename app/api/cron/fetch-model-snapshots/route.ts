import { NextRequest, NextResponse } from 'next/server';

import {
  FeishuApiError,
  maybeSendFeishuSnapshotNotification,
} from '@/lib/feishu-notifier';
import { fetchModelSnapshots } from '@/lib/model-snapshot-cron';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SNAPSHOT_MODEL_IDS = [256, 220, 250, 268];

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }

  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const baseUrl = request.nextUrl.searchParams.get('baseUrl') ?? undefined;
    const result = await fetchModelSnapshots({ modelIds: SNAPSHOT_MODEL_IDS, baseUrl });
    let feishu = null;

    try {
      feishu = await maybeSendFeishuSnapshotNotification(result);
    } catch (error) {
      console.error('[cron/fetch-model-snapshots] feishu notification failed', error);
      feishu = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        details: error instanceof FeishuApiError ? error.details : undefined,
      };
    }

    return NextResponse.json({
      ...result,
      feishu,
    });
  } catch (error) {
    console.error('[cron/fetch-model-snapshots] failed', error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
