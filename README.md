# Landing Page Auditor

> **Work in progress:** this is an early prototype. Features, output and setup may change.

A command-line tool that captures a landing page, reviews it with AI against a 10-point checklist and builds an HTML report.

## Requirements

- Node.js 22 or newer
- Google Chrome (optional, improves video playback)
- An Anthropic API key (reviews are billed per use)

## Setup

```bash
npm install
npx playwright install chromium
```

The AI review currently uses Claude, so other providers' keys won't work. Create a `.env` file in the project folder with your Anthropic API key:

```text
ANTHROPIC_API_KEY=your-key-here
```

Set a spending limit in the Claude Console. Never commit `.env`.

## Usage

```bash
node audit.mjs https://example.com
```

This captures the page, reviews it and builds the report. On macOS, the report opens automatically.

| Option | Description |
| --- | --- |
| `--headed` | Show the browser during capture, which can help maps render |
| `--dry-run` | Capture and prepare the input without calling the API |

## Output

Each run is saved in its own folder:

```text
reports/<site-and-path>/<date_time>/output/
```

| File | Content |
| --- | --- |
| `report.html` | Shareable single-file report |
| `findings.json` | Review results |
| `desktop.json`, `mobile.json` | Page content and element positions |
| `*-fold.png` | First screen |
| `*-full.png` | Full page |
| `*-map-N.png` | Google Maps close-ups, when present |

## Report

- Summary and issue counts
- Issues filtered by high, medium or low severity
- Cropped screenshots that highlight the related element, when available
- Manual tests and passed checks

## Checklist

1. The headline says what is offered and for whom.
2. The main call to action is visible without scrolling on mobile and desktop.
3. Call-to-action labels are specific and consistent.
4. Visual hierarchy leads from headline to benefit to action.
5. Benefits are concrete, not generic claims.
6. Proof such as testimonials, clients or numbers sits near key decisions.
7. Mobile has no overflow, tiny text or crowded tap targets.
8. Text contrast, alt text and form labels meet basic accessibility needs.
9. Forms ask only for necessary information.
10. The main content loads quickly and does not shift.

## Running steps separately

The scripts read and write `output/` in the current folder.

```bash
node capture.mjs https://example.com
node review.mjs
node report.mjs
```

Run the review again after every new capture. These runs overwrite earlier files.

## Privacy

The review sends screenshots, page text and links to the Claude API. Only audit pages you're allowed to share.

## Limitations

- Audits one public page at a time.
- Pages showing a Cloudflare challenge are skipped.
- Mobile is emulated, not tested on a real device.
- Some lazy content, videos, maps or carousel slides may not appear.
- Speed, layout shift and exact contrast are not measured.
- Findings are AI-generated. Verify them before acting or sharing.

## Roadmap

- [x] Capture
- [x] AI review
- [x] HTML report
- [x] Single audit command
- [ ] CRO suggestions
- [ ] Agent loop
- [ ] Testing and tuning
- [ ] Web version
