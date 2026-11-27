// usage: node scripts/capture.mjs [url]
// Records the live demo: a MISLABELLED visit, the giant switch flipping the real Flagsmith flag, then a fixed visit.
import { chromium } from 'playwright';
import { rmSync, mkdirSync, renameSync } from 'node:fs';

const URL = process.argv[2] || 'http://localhost:8090';
const SIZE = { width: 1280, height: 800 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// scroll the terminal into view as soon as it starts typing, so the reveal is on camera
async function toTerm(page) {
  await page.waitForSelector('#term', { timeout: 60000 });
  await page.waitForFunction(() => (document.getElementById('c1')?.textContent || '').length > 0, null, { timeout: 45000 });
  await page.evaluate(() => {
    const y = document.getElementById('term').getBoundingClientRect().top + scrollY - 20;
    scrollTo({ top: y, behavior: 'smooth' });
  });
}
// tight screenshot: from the terminal down to the verdict
async function shot(page, path) {
  const b = await page.evaluate(() => {
    const t = document.getElementById('term').getBoundingClientRect(), v = document.getElementById('verdict').getBoundingClientRect();
    return { x: Math.max(0, t.left - 28), y: Math.max(0, t.top + scrollY - 28), w: t.width + 56, h: v.bottom - t.top + 56 };
  });
  await page.screenshot({ path, fullPage: true, clip: { x: b.x, y: b.y, width: b.w, height: b.h } });
}

mkdirSync('docs/.rec', { recursive: true });

const browser = await chromium.launch();
let saved = null;

for (let attempt = 1; attempt <= 15 && !saved; attempt++) {
  const ctx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: 'docs/.rec', size: SIZE } });
  const page = await ctx.newPage();
  const video = page.video();
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });   // first hit sets a cookie and reloads
    await toTerm(page);
    await page.waitForSelector('#banner.bad, #banner.good', { timeout: 45000 });
    const verdict = (await page.textContent('#banner')).trim();
    console.log(`attempt ${attempt}: ${verdict}`);
    if (verdict !== 'MISLABELLED') { await ctx.close(); rmSync(await video.path(), { force: true }); continue; }

    await sleep(1600);
    await shot(page, 'docs/shot-mislabelled.png');

    // scroll to the giant switch and flip the bug off
    await page.evaluate(() => document.getElementById('panel').scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await sleep(1400);
    if ((await page.getAttribute('#flipbtn', 'aria-checked')) === 'true') await page.click('#flipbtn');
    await page.waitForFunction(() => /Flagsmith answered 200/.test(document.getElementById('fliptxt').textContent), null, { timeout: 15000 });
    await sleep(1600);
    await page.locator('#panel').screenshot({ path: 'docs/shot-switch-off.png' });

    // wait for cached copies to expire, then load the page again: it should match
    await sleep(5200);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(700);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await toTerm(page);
    await page.waitForSelector('#banner.bad, #banner.good', { timeout: 45000 });
    const after = (await page.textContent('#banner')).trim();
    console.log('after the fix:', after);
    if (after !== 'MATCH') throw new Error('expected MATCH after the fix, got ' + after + ' (cached copy not expired yet?)');
    await sleep(1600);
    await shot(page, 'docs/shot-fixed.png');

    // put the bug back on for the next visitor (it would also auto-restore after 60 s)
    await page.evaluate(() => document.getElementById('panel').scrollIntoView({ block: 'center' }));
    await sleep(300);
    if ((await page.getAttribute('#flipbtn', 'aria-checked')) === 'false') await page.click('#flipbtn');
    await sleep(800);

    await ctx.close();
    saved = await video.path();
  } catch (e) {
    console.log(`attempt ${attempt} failed: ${e.message.split('\n')[0]}`);
    await ctx.close().catch(() => {});
    rmSync(await video.path().catch(() => ''), { force: true });
  }
}
await browser.close();
if (!saved) { console.error('No MISLABELLED visit captured. Is the bug flag on and the site up?'); process.exit(1); }
renameSync(saved, 'docs/.rec/demo.webm');
console.log('recorded docs/.rec/demo.webm');
