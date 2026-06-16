import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';

import { get, put } from '@vercel/blob';

const MODEL_SNAPSHOT_PREFIX = 'model-detail-snapshots';
const LATEST_SCORE_PATH = 'latest-score-snapshots.jsonl';

export type SnapshotStorageBackend = 'blob' | 'local';

function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function shouldUseBlob() {
  return process.env.SNAPSHOT_STORAGE === 'blob' || (process.env.VERCEL === '1' && hasBlobToken());
}

function repoPath(...segments: string[]) {
  return path.join(process.cwd(), ...segments);
}

async function blobText(pathname: string) {
  const result = await get(pathname, {
    access: 'public',
    useCache: false,
  });

  if (!result?.stream) {
    throw new Error(`Blob snapshot not found: ${pathname}`);
  }

  return new Response(result.stream).text();
}

async function putBlobText(pathname: string, body: string, contentType: string) {
  await put(pathname, body, {
    access: 'public',
    allowOverwrite: true,
    contentType,
    cacheControlMaxAge: 60,
  });
}

export function getSnapshotStorageBackend(): SnapshotStorageBackend {
  return shouldUseBlob() ? 'blob' : 'local';
}

export async function readModelSnapshot(modelId: string | number) {
  const filename = `model-${modelId}.json`;

  if (shouldUseBlob()) {
    const file = await blobText(`${MODEL_SNAPSHOT_PREFIX}/${filename}`);
    return JSON.parse(file);
  }

  const file = await readFile(repoPath('data', MODEL_SNAPSHOT_PREFIX, filename), 'utf8');
  return JSON.parse(file);
}

export async function writeModelSnapshot(modelId: string | number, snapshot: unknown) {
  const filename = `model-${modelId}.json`;
  const body = `${JSON.stringify(snapshot, null, 2)}\n`;

  if (shouldUseBlob()) {
    const pathname = `${MODEL_SNAPSHOT_PREFIX}/${filename}`;
    await putBlobText(pathname, body, 'application/json');
    return { backend: 'blob' as const, path: pathname };
  }

  const file = repoPath('data', MODEL_SNAPSHOT_PREFIX, filename);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body, 'utf8');
  return { backend: 'local' as const, path: file };
}

export async function appendLatestScoreSnapshots(records: unknown[]) {
  const lines = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;

  if (shouldUseBlob()) {
    let previous = '';

    try {
      previous = await blobText(LATEST_SCORE_PATH);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('not found')) {
        throw error;
      }
    }

    await putBlobText(LATEST_SCORE_PATH, `${previous}${lines}`, 'application/x-ndjson');
    return { backend: 'blob' as const, path: LATEST_SCORE_PATH };
  }

  const file = repoPath('data', LATEST_SCORE_PATH);
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, lines, 'utf8');
  return { backend: 'local' as const, path: file };
}
