#!/usr/bin/env tsx

import { sendConfiguredFeishuMessage } from '../lib/feishu-message-service';

function getArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

async function main() {
  const result = await sendConfiguredFeishuMessage({
    dryRun: hasFlag('--dry-run'),
    receiveId: getArg('--receive-id') ?? undefined,
    receiveIdType: getArg('--receive-id-type') ?? undefined,
    text: getArg('--text') ?? undefined,
    uuid: getArg('--uuid') ?? undefined,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
