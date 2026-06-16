#!/usr/bin/env tsx

import { fetchModelSnapshots, resolveCronModelIds } from '../lib/model-snapshot-cron';

function getArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

const rawModelIds = getArg('--model-ids')
  ?? process.env.MODEL_IDS
  ?? getArg('--model-id')
  ?? process.env.MODEL_ID;

async function main() {
  const modelIds = resolveCronModelIds(rawModelIds);
  const result = await fetchModelSnapshots({
    modelIds,
    baseUrl: getArg('--base-url') ?? process.env.AISTUPIDLEVEL_BASE_URL,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
