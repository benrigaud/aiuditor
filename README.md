# Landing Page Auditor

An agent that audits landing pages. Phase 1, page capture, is complete.

## Requirements

- Node.js (recent LTS or newer)
- Google Chrome (optional, improves video playback)

## Setup

```bash
npm install
npx playwright install chromium
```

## Usage

```bash
node capture.mjs https://example.com
```

To watch the browser, which can help embedded maps render:

```bash
node capture.mjs https://example.com --headed
```

## Output

Files are saved in `output/`, for both `desktop` and `mobile`:

| File | Content |
| --- | --- |
| `*-fold.png` | First screen |
| `*-full.png` | Full page |
| `*-map-N.png` | Close-up of each Google Maps embed |
| `*.json` | Title, headings, buttons, links and image alt text |

Runs overwrite files with the same name. Clear `output/` between pages to avoid mixing results.

## Limitations

- Pages showing a Cloudflare challenge are skipped.
- Mobile is emulated in Chrome or Chromium, not a real device.
- Some lazy content, videos or maps may not appear.

## Roadmap

- [x] Capture
- [ ] AI review
- [ ] HTML report
- [ ] CRO suggestions
- [ ] Agent loop
- [ ] Testing and tuning
- [ ] Web version
