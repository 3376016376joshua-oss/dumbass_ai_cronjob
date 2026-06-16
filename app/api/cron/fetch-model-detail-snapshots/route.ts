import { NextRequest, NextResponse } from 'next/server';

import { fetchModelDetailSnapshots, resolveCronModelIds } from '@/lib/model-snapshot-cron';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
    const modelIds = resolveCronModelIds(request.nextUrl.searchParams.get('models'));
    const baseUrl = request.nextUrl.searchParams.get('baseUrl') ?? undefined;
    const result = await fetchModelDetailSnapshots({ modelIds, baseUrl });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[cron/fetch-model-detail-snapshots] failed', error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
