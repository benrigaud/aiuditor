import { chromium, devices } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node capture.mjs https://example.com');
  process.exit(1);
}

const views = {
  desktop: { viewport: { width: 1440, height: 900 } },
  // 2x keeps long mobile screenshots under Chrome's height limit
  mobile: { ...devices['iPhone 13'], deviceScaleFactor: 2 },
};

// Scroll in small steps, bring each image into view, and wait for it to load
async function loadLazyContent(page) {
  for (let i = 0; i < 100; i++) {
    const atBottom = await page.evaluate(() => {
      window.scrollBy({ top: window.innerHeight / 2, behavior: 'instant' });
      return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    });
    await page.waitForTimeout(300);
    if (atBottom) break;
  }

  // Catches images inside carousels or inner scrolling areas
  for (const img of await page.locator('img:visible').all()) {
    await img.evaluate((el) => {
      el.loading = 'eager';
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
    }, null, { timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(100);
  }

  // Give embedded content such as maps time to load
  for (const frame of await page.locator('iframe:visible').all()) {
    await frame.evaluate((el) => {
      el.loading = 'eager';
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
    }, null, { timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  await page.waitForFunction(() =>
    [...document.images]
      .filter((i) => i.checkVisibility())
      .every((i) => i.complete),
    null, { timeout: 15000 },
  ).catch(() => console.warn('Warning: some images did not finish loading'));

  await page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) {
      if (el.scrollTop || el.scrollLeft) el.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.waitForTimeout(1500);
}

// List visible elements with an ID and position, so findings can point to them
async function collectElements(page, prefix) {
  return page.evaluate((idPrefix) => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const pageWidth = document.documentElement.scrollWidth;
    const selector = 'header, nav, section, footer, form, h1, h2, h3, h4, p, li, '
      + 'a[href], button, [role="button"], label, input:not([type="hidden"]), '
      + 'textarea, select, img, video, iframe';
    const elements = [];

    for (const el of document.querySelectorAll(selector)) {
      if (elements.length >= 300) break;
      if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
      const r = el.getBoundingClientRect();
      const x = r.left + window.scrollX;
      const y = r.top + window.scrollY;
      // Skip tiny items and off-screen carousel slides
      if (r.width < 8 || r.height < 8 || x + r.width <= 0 || x >= pageWidth) continue;

      const isBlock = el.matches('header, nav, section, footer, form');
      const label = el.getAttribute('aria-label') || el.getAttribute('alt')
        || el.getAttribute('placeholder')
        || (isBlock ? el.querySelector('h1, h2, h3')?.innerText || el.id : el.innerText);

      elements.push({
        id: `${idPrefix}${elements.length + 1}`,
        tag: el.tagName.toLowerCase(),
        text: clean(label),
        box: {
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(r.width),
          height: Math.round(r.height),
        },
      });
    }
    return { pageWidth, elements };
  }, prefix);
}

await mkdir('output', { recursive: true });
// Add --headed to watch the browser; maps sometimes render only this way
const headless = !process.argv.includes('--headed');

// Installed Google Chrome plays more video formats (such as H.264) than bundled Chromium
const browser = await chromium.launch({ channel: 'chrome', headless })
  .catch(() => chromium.launch({ headless }));

// Wait until visible videos are playing, or give up after 15 seconds
async function waitForVideos(page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('video')]
      .filter((v) => v.checkVisibility())
      .every((v) => v.readyState >= 3 && (!v.autoplay || v.currentTime > 0.5)),
    null, { timeout: 15000 },
  ).catch(() => console.warn('Warning: a video did not load in time'));
}

try {
  for (const [name, options] of Object.entries(views)) {
    const context = await browser.newContext({
      ...options,
      defaultBrowserType: undefined,
      reducedMotion: 'reduce', // many sites then show content without scroll animations
    });
    const page = await context.newPage();
    // Remember whether the latest page response was a Cloudflare challenge
    let challenged = false;
    page.on('response', (res) => {
      if (res.request().isNavigationRequest() && res.frame() === page.mainFrame()) {
        challenged = res.headers()['cf-mitigated'] === 'challenge';
      }
    });

    await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(5000);

    if (challenged) {
      console.warn(`Skipped ${name}: blocked by a security check, so it can't be audited`);
      await context.close();
      continue;
    }

    await waitForVideos(page);

    // First screen only: what visitors see before scrolling
    await page.screenshot({ path: `output/${name}-fold.png` });

    // Visit the whole page so lazy images load, then return to the top
    await loadLazyContent(page);
    // Chrome repeats content in screenshots taller than about 16,000 pixels
    const tooTall = await page.evaluate(
      () => document.documentElement.scrollHeight * window.devicePixelRatio > 16000,
    );
    await page.screenshot({
      path: `output/${name}-full.png`,
      fullPage: true,
      scale: tooTall ? 'css' : 'device',
    });

    // Record where elements are, matching the full-page screenshot just taken
    const layout = await collectElements(page, name[0]);

    // Separate close-up of each map, taken while it is on screen
    const maps = page.locator(
      'iframe[src*="google.com/maps"]:visible, iframe[src*="maps.google."]:visible',
    );
    for (const [i, map] of (await maps.all()).entries()) {
      try {
        await map.scrollIntoViewIfNeeded({ timeout: 5000 });
        await page.waitForTimeout(3000);
        await map.screenshot({ path: `output/${name}-map-${i + 1}.png`, timeout: 10000 });
      } catch {
        console.warn(`Warning: could not capture map ${i + 1}`);
      }
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));

    const data = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const visible = (el) => el.checkVisibility({ visibilityProperty: true });
      const all = (selector) => [...document.querySelectorAll(selector)];
      return {
        title: document.title,
        headings: all('h1, h2, h3').filter(visible)
          .map((h) => ({ level: h.tagName, text: clean(h.innerText) })),
        buttons: all('button, [role="button"], input[type="submit"]').filter(visible)
          .map((b) => clean(b.innerText || b.value || b.getAttribute('aria-label'))),
        links: all('a[href]').filter(visible)
          .map((a) => ({ text: clean(a.innerText || a.getAttribute('aria-label')), href: a.href })),
        images: all('img').map((i) => ({ src: i.currentSrc || i.src, alt: i.getAttribute('alt') })),
      };
    });

    const capturedAt = new Date().toISOString();
    await writeFile(
      `output/${name}.json`,
      JSON.stringify({ url, capturedAt, ...data, ...layout }, null, 2),
    );
    console.log(`Captured ${name}`);
    await context.close();
  }
} finally {
  await browser.close();
}
