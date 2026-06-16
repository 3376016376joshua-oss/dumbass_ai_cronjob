#!/usr/bin/env tsx

import { fetchLatestScoreSnapshots, resolveCronModelIds } from '../lib/model-snapshot-cron';

async function main() {
  const modelIds = resolveCronModelIds(process.env.MODEL_IDS ?? process.env.MODEL_ID);
  const result = await fetchLatestScoreSnapshots({
    modelIds,
    baseUrl: process.env.AISTUPIDLEVEL_BASE_URL,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
