import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
const address = args.find((a) => !a.startsWith('--'));
const headed = args.includes('--headed');
const dryRun = args.includes('--dry-run'); // capture and prepare only, no API call

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

let url;
try {
  url = new URL(address);
} catch {
  fail('Usage: node audit.mjs https://example.com [--headed] [--dry-run]');
}
if (!['http:', 'https:'].includes(url.protocol)) fail('The address must start with http or https.');

// Check the API key first, so a missing key doesn't waste a capture
const envFile = join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
  fail('Add ANTHROPIC_API_KEY to the .env file in the project folder.');
}

// One folder per run, such as reports/example.com-pricing/2026-01-31_14-05-09
const slug = `${url.hostname}${url.pathname}`
  .replace(/[^a-z0-9.]+/gi, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  + `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
const runFolder = join(root, 'reports', slug, stamp);
mkdirSync(runFolder, { recursive: true });

// Each script writes to output/ inside the run folder
function run(step, script, scriptArgs = []) {
  console.log(`\n${step}`);
  const result = spawnSync(process.execPath, [join(root, script), ...scriptArgs], {
    cwd: runFolder,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    fail(`${script} did not finish. Files so far are in ${relative(root, runFolder)}`);
  }
}

run('1/3 Capture', 'capture.mjs', [url.href, ...(headed ? ['--headed'] : [])]);

const missing = ['desktop', 'mobile']
  .filter((view) => !existsSync(join(runFolder, 'output', `${view}.json`)));
if (missing.length) fail(`The page could not be captured on ${missing.join(' and ')}.`);

run('2/3 Review', 'review.mjs', dryRun ? ['--dry-run'] : []);
if (dryRun) {
  console.log(`\nDry run finished. Captures are in ${relative(root, runFolder)}`);
  process.exit(0);
}

run('3/3 Report', 'report.mjs');

const report = join(runFolder, 'output', 'report.html');
console.log(`\nDone: ${relative(root, report)}`);
if (process.platform === 'darwin') spawnSync('open', [report]);
