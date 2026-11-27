import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Findings and page text are untrusted, so escape everything placed in the HTML
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Embed images so the report is a single file you can share
async function embed(path, width) {
  try {
    const jpeg = await sharp(path)
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  } catch {
    console.warn(`Warning: could not include ${path}`);
    return null;
  }
}

const card = (f) => `
  <article class="card ${escapeHtml(f.severity)}" data-severity="${escapeHtml(f.severity)}">
    <p class="meta">
      ${f.status === 'issue' ? `<span class="badge">${escapeHtml(f.severity)}</span>` : ''}
      Check ${escapeHtml(f.check)} · ${escapeHtml(f.view)}
    </p>
    <h3>${escapeHtml(f.checkText)}</h3>
    <h4>What we saw</h4>
    <p>${escapeHtml(f.evidence)}</p>
    <h4>${f.status === 'unclear' ? 'How to test' : 'Suggested fix'}</h4>
    <p>${escapeHtml(f.fix)}</p>
  </article>`;

async function main() {
  const report = JSON.parse(await readFile('output/findings.json', 'utf8'));
  const capture = JSON.parse(await readFile('output/desktop.json', 'utf8'));

  const order = { high: 0, medium: 1, low: 2, none: 3 };
  const byStatus = (status) => report.findings
    .filter((f) => f.status === status)
    .sort((a, b) => order[a.severity] - order[b.severity]);
  const issues = byStatus('issue');
  const unclear = byStatus('unclear');
  const passed = byStatus('pass');

  const stats = ['high', 'medium', 'low'].map((level) => `
    <div class="stat ${level}">
      <strong>${issues.filter((f) => f.severity === level).length}</strong>${level}
    </div>`).join('');

  // Skip screenshots if the folder now holds a capture of a different page
  let shots = '';
  if (capture.url === report.url) {
    for (const [view, width] of [['desktop', 1200], ['mobile', 500]]) {
      const src = await embed(`output/${view}-fold.png`, width);
      if (src) {
        shots += `<figure class="${view}"><img src="${src}" alt="First screen on ${view}">
          <figcaption>First screen, ${view}</figcaption></figure>`;
      }
    }
  } else {
    console.warn('Screenshots left out: they belong to a different page than the findings');
  }

  // Filter buttons start hidden and appear only if the browser runs the script
  const filters = `<div class="filters" role="group" aria-label="Filter issues by severity" hidden>
    ${['all', 'high', 'medium', 'low'].map((level) => {
      const count = level === 'all'
        ? issues.length
        : issues.filter((f) => f.severity === level).length;
      return `<button type="button" data-filter="${level}"
        aria-pressed="${level === 'all'}" ${count ? '' : 'disabled'}>${level} (${count})</button>`;
    }).join('')}
  </div>`;

  const section = (title, items, id = '', controls = '') => (items.length
    ? `<section id="${id}"><h2>${title} (${items.length})</h2>${controls}${items.map(card).join('')}</section>`
    : '');

  const date = new Date(report.reviewedAt).toLocaleDateString('en-US', { dateStyle: 'long' });

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Landing page audit: ${escapeHtml(report.url)}</title>
<style>
  /* Based on the shadcn/ui neutral theme, written in plain CSS */
  :root {
    --background: oklch(1 0 0);
    --foreground: oklch(0.145 0 0);
    --card: oklch(1 0 0);
    --primary: oklch(0.205 0 0);
    --primary-foreground: oklch(0.985 0 0);
    --muted: oklch(0.97 0 0);
    --muted-foreground: oklch(0.5 0 0);
    --border: oklch(0.922 0 0);
    --ring: oklch(0.708 0 0);
    --destructive: oklch(0.577 0.245 27.325);
    --warning: oklch(0.555 0.163 48.998);
    --info: oklch(0.488 0.243 264.376);
    --radius: 0.625rem;
    --shadow: 0 1px 3px rgb(0 0 0 / .08), 0 1px 2px -1px rgb(0 0 0 / .08);
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--background); color: var(--foreground); font: 14px/1.6 Geist, Inter, ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  main { max-width: 880px; margin: 0 auto; padding: 40px 20px 64px; overflow-wrap: anywhere; }
  h1, h2, h3 { letter-spacing: -0.025em; line-height: 1.3; }
  h1 { margin: 0 0 4px; font-size: 1.875rem; }
  h2 { margin: 40px 0 16px; font-size: 1.25rem; }
  h3 { margin: 12px 0; font-size: 1rem; font-weight: 600; }
  h4 { margin: 16px 0 0; font-size: .875rem; font-weight: 500; }
  p { margin: 4px 0; }
  .meta, figcaption, .card h4 + p { color: var(--muted-foreground); }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 24px 0; }
  .stat, .card { background: var(--card); border: 1px solid var(--border); border-radius: calc(var(--radius) + 4px); box-shadow: var(--shadow); }
  .stat { padding: 20px; text-transform: capitalize; font-weight: 500; }
  .stat strong { display: block; font-size: 1.875rem; font-weight: 600; font-variant-numeric: tabular-nums; }
  .stat::before { content: ""; display: block; width: 8px; height: 8px; margin-bottom: 8px; border-radius: 99px; background: var(--tone); }
  .card { padding: 24px; margin-bottom: 16px; }
  .high { --tone: var(--destructive); }
  .medium { --tone: var(--warning); }
  .low { --tone: var(--info); }
  .meta { font-size: .75rem; }
  .badge { display: inline-block; margin-right: 8px; padding: 1px 8px; border: 1px solid color-mix(in oklab, var(--tone) 30%, transparent); border-radius: 99px; background: color-mix(in oklab, var(--tone) 10%, transparent); color: var(--tone); font-weight: 500; text-transform: capitalize; }
  .shots { display: grid; grid-template-columns: 3fr 1fr; gap: 16px; align-items: start; }
  figure { margin: 0; }
  img { width: 100%; border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
  figcaption { font-size: .75rem; }
  .filters { display: inline-flex; flex-wrap: wrap; gap: 3px; margin-bottom: 16px; padding: 3px; background: var(--muted); border-radius: var(--radius); }
  [hidden] { display: none !important; }
  button { min-height: 36px; padding: 4px 12px; border: 0; border-radius: calc(var(--radius) - 2px); background: transparent; color: var(--muted-foreground); font: inherit; font-weight: 500; text-transform: capitalize; cursor: pointer; }
  button[aria-pressed="true"] { background: var(--primary); color: var(--primary-foreground); box-shadow: var(--shadow); }
  button:disabled { opacity: .5; cursor: default; }
  button:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }
  @media (max-width: 600px) { .shots { grid-template-columns: 1fr; } .stats { gap: 8px; } .stat { padding: 14px; } }
  @media print { .filters { display: none !important; } #issues .card[hidden] { display: block !important; } .card, .stat { box-shadow: none; break-inside: avoid; } .badge, .stat::before { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style>
</head>
<body>
<main>
  <h1>Landing page audit</h1>
  <p>${escapeHtml(report.url)}</p>
  <p class="meta">Reviewed ${escapeHtml(date)} · AI-assisted review, verify before acting</p>
  <div class="stats">${stats}</div>
  <h2>Summary</h2>
  <p>${escapeHtml(report.summary)}</p>
  ${shots ? `<h2>Screenshots</h2><div class="shots">${shots}</div>` : ''}
  ${section('Issues to fix', issues, 'issues', filters)}
  ${section('To test manually', unclear)}
  ${section('Passed', passed)}
</main>
<script>
  const filters = document.querySelector('.filters');
  if (filters) {
    filters.hidden = false;
    filters.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      for (const b of filters.querySelectorAll('button')) {
        b.setAttribute('aria-pressed', String(b === button));
      }
      const level = button.dataset.filter;
      for (const card of document.querySelectorAll('#issues .card')) {
        card.hidden = level !== 'all' && card.dataset.severity !== level;
      }
    });
  }
</script>
</body>
</html>`;

  await writeFile('output/report.html', html);
  console.log(`Saved output/report.html with ${issues.length} issues`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
