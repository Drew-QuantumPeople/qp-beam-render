// qp-beam-render — HTML -> PNG render service (Playwright/Chromium). Render-only; called by Beam graphics agent.
const express = require('express');
const { chromium } = require('playwright');
const app = express();
app.use(express.json({ limit: '30mb' }));
const TOKEN = process.env.RENDER_TOKEN || '';
let browser;
async function getBrowser() {
  if (!browser || !browser.isConnected()) browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  return browser;
}
app.get('/health', (_req, res) => res.json({ ok: true }));
app.post('/render', async (req, res) => {
  if (TOKEN && req.headers['x-render-token'] !== TOKEN) return res.status(401).json({ error: 'unauthorized' });
  const { html, width = 840, height, deviceScaleFactor = 2 } = req.body || {};
  if (!html || typeof html !== 'string') return res.status(400).json({ error: 'html (string) required' });
  let ctx;
  try {
    const b = await getBrowser();
    // When an explicit height is given, capture an exact width×height clip (fixed-size cards like
    // landscape features). Otherwise fall back to content-driven fullPage (e.g. the tall infographic).
    ctx = await b.newContext({ viewport: { width, height: height || 1200 }, deviceScaleFactor });
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: 'networkidle', timeout: 30000 });
    await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));
    await page.waitForTimeout(250);
    const png = height
      ? await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } })
      : await page.screenshot({ fullPage: true, type: 'png' });
    res.set('Content-Type', 'image/png').send(png);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e).slice(0, 300) });
  } finally { if (ctx) await ctx.close().catch(() => {}); }
});
const port = process.env.PORT || 8080;
app.listen(port, () => console.log('qp-beam-render listening on', port));
