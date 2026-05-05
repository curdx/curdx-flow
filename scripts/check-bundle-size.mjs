#!/usr/bin/env node
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, '..', 'dist', 'index.mjs');
const THRESHOLD_KB = 84;
const THRESHOLD_BYTES = THRESHOLD_KB * 1024;

let stat;
try {
  stat = statSync(distPath);
} catch (err) {
  console.error(`[check:bundle] dist/index.mjs not found at ${distPath} — run "npm run build" first.`);
  process.exit(2);
}

const sizeKB = (stat.size / 1024).toFixed(2);
if (stat.size > THRESHOLD_BYTES) {
  console.error(`[check:bundle] FAIL: ${sizeKB} KB > ${THRESHOLD_KB} KB threshold (NFR-3). Trigger D-5 lazy import.`);
  process.exit(1);
}
console.log(`[check:bundle] PASS: ${sizeKB} KB <= ${THRESHOLD_KB} KB threshold (NFR-3).`);
process.exit(0);
