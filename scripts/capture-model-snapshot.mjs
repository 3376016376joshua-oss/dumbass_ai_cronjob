#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (error) {
  console.error('Missing dependency: playwright. Run `npm install` before using this script.');
  throw error;
}

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function getNumberArg(flag, envName, fallback) {
  const raw = getArg(flag) ?? process.env[envName];
  if (raw == null) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${flag}/${envName}: ${raw}`);
  }

  return value;
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const modelIds = getArg('--model-ids') ?? process.env.MODEL_IDS ?? '256,220,250,268';
const period = getArg('--period') ?? process.env.MODEL_CAPTURE_PERIOD ?? '7d';
const baseUrl = (getArg('--base-url') ?? process.env.AISTUPIDLEVEL_CAPTURE_BASE_URL ?? 'http://localhost:3000')
  .replace(/\/$/, '');
const targetUrl = getArg('--url')
  ?? process.env.MODEL_CAPTURE_URL
  ?? `${baseUrl}/snapshot/compare?capture=1&ids=${encodeURIComponent(modelIds)}&period=${encodeURIComponent(period)}`;
const outputDir = getArg('--output-dir') ?? process.env.MODEL_CAPTURE_DIR ?? path.join(repoRoot, 'snapshots');
const viewportWidth = getNumberArg('--viewport-width', 'MODEL_CAPTURE_VIEWPORT_WIDTH', 1920);
const viewportHeight = getNumberArg('--viewport-height', 'MODEL_CAPTURE_VIEWPORT_HEIGHT', 1080);
const deviceScaleFactor = getNumberArg('--scale', 'MODEL_CAPTURE_SCALE', 2);
const chartSelector = getArg('--chart-selector')
  ?? process.env.MODEL_CAPTURE_CHART_SELECTOR
  ?? '.md-comparison-panel';

const fullPath = getArg('--full-output')
  ?? process.env.MODEL_CAPTURE_FULL_FILE
  ?? path.join(outputDir, `coding-comparison-full@${deviceScaleFactor}x.png`);
const chartPath = getArg('--chart-output')
  ?? process.env.MODEL_CAPTURE_CHART_FILE
  ?? path.join(outputDir, `coding-comparison@${deviceScaleFactor}x.png`);

await mkdir(path.dirname(fullPath), { recursive: true });
await mkdir(path.dirname(chartPath), { recursive: true });

const browser = await chromium.launch({
  headless: true,
});

try {
  const page = await browser.newPage({
    viewport: {
      width: viewportWidth,
      height: viewportHeight,
    },
    deviceScaleFactor,
  });

  await page.goto(targetUrl, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  await page.locator(`${chartSelector} .recharts-surface`).waitFor({
    state: 'visible',
    timeout: 30000,
  });

  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  });

  await page.waitForTimeout(500);

  await page.screenshot({
    path: fullPath,
    fullPage: true,
  });

  await page.locator(chartSelector).screenshot({
    path: chartPath,
  });

  console.log(JSON.stringify({
    ok: true,
    targetUrl,
    viewport: {
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor,
    },
    files: {
      full: fullPath,
      chart: chartPath,
    },
  }, null, 2));
} finally {
  await browser.close();
}
