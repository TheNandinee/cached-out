import express from 'express';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as fsmod from '@flagsmith/nodejs';

const Flagsmith = fsmod.Flagsmith ?? fsmod.default;
const fs = new Flagsmith({ environmentKey: process.env.FS_SERVER_KEY });
const H = JSON.parse(readFileSync(new URL('./headlines.json', import.meta.url)));
const MODE = { r1: 'assignment', r2: 'assignment', r3: 'rendered', r4: 'assignment' };
const VERSION = process.env.FLAG_VERSION || 'v0';

const app = express();
app.use(cookieParser());

app.get('/', async (req, res) => {
  const run = req.get('X-Run') || 'r1';
  const flag = `headline_${run}_${VERSION}`;
  let uid = req.cookies.uid;
  if (!uid) {
    uid = `web-${randomUUID()}`;
    res.cookie('uid', uid, { maxAge: 30 * 864e5, sameSite: 'lax' });
  }
  let variant = 'control';
  try {
    // Plain evaluation: records NO exposure. Exposure is recorded where the page is displayed.
    const f = (await fs.getIdentityFlags(uid)).getFlag(flag);
    if (f?.value === 'b') variant = 'b';
  } catch (e) { console.error('flag eval failed:', e.message); }

  res.set('Cache-Control', 'no-store'); // app says "don't cache"; r2/r3 edges ignore it (the bug)
  res.send(page({ run, flag, variant, mode: MODE[run] }));
});

app.get('/healthz', (_, res) => res.send('ok'));
app.listen(3000, () => console.log(`app on :3000 (flags *_${VERSION})`));

function page({ run, flag, variant, mode }) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Cached Out</title>
<style>body{font:18px/1.5 system-ui;max-width:640px;margin:10vh auto;padding:0 20px}
h1{font-size:28px}button{font-size:18px;padding:10px 18px;cursor:pointer}small{color:#777}</style></head>
<body data-run="${run}" data-flag="${flag}" data-variant="${variant}" data-mode="${mode}">
<h1>${esc(H[variant])}</h1>
<button id="read">Read the story →</button>
<p id="thanks" hidden>Thanks — counted.</p>
<small>Headline from the Upworthy Research Archive (CC BY 4.0). Run ${run}.</small>
<script type="module">
import flagsmith from 'https://esm.sh/@flagsmith/flagsmith@12';
const d = document.body.dataset;
let uid = (document.cookie.match(/(?:^|; )uid=([^;]+)/) || [])[1];
if (!uid) { uid = 'web-' + crypto.randomUUID(); document.cookie = 'uid=' + uid + '; max-age=2592000; path=/; samesite=lax'; }
await flagsmith.init({ environmentID: '${process.env.FS_CLIENT_KEY}', enableEvents: true });
await flagsmith.identify(uid);
if (d.mode === 'assignment') {
  flagsmith.getExperimentFlag(d.flag);
} else {
  const f = flagsmith.getAllFlags()[d.flag];
  if (f?.experiment?.inExperiment) flagsmith.trackExposureEvent(d.flag, { value: d.variant });
}
document.getElementById('read').onclick = async () => {
  flagsmith.trackEvent('headline_click');
  await flagsmith.flushEvents();
  document.getElementById('thanks').hidden = false;
};
addEventListener('pagehide', () => flagsmith.flushEvents());
</script></body></html>`;
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
