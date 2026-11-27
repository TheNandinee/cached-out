import express from 'express';
import cookieParser from 'cookie-parser';
import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'node:fs';
import * as fsmod from '@flagsmith/nodejs';

const Flagsmith = fsmod.Flagsmith ?? fsmod.default;
const fs = new Flagsmith({ environmentKey: process.env.FS_SERVER_KEY });
const H = JSON.parse(readFileSync(new URL('./headlines.json', import.meta.url)));
const EXP_FLAG = 'headline_live', BUG_FLAG = 'cache_bug_on';
const LEDGER = '/tmp/live_ledger.csv';
if (!existsSync(LEDGER)) writeFileSync(LEDGER, 'time,uid,bug_on,assigned,shown,mislabelled\n');
const stats = { on: { views: 0, mis: 0 }, off: { views: 0, mis: 0 } };

let bug = { v: true, t: 0 };
async function bugOn() {
  if (Date.now() - bug.t < 2000) return bug.v;
  try { bug = { v: (await fs.getEnvironmentFlags()).isFeatureEnabled(BUG_FLAG), t: Date.now() }; } catch {}
  return bug.v;
}

const app = express();
app.use(cookieParser()); app.use(express.json());

app.get('/', async (req, res) => {
  const uid = req.cookies.uid;
  if (!uid) {                       // first visit: give the browser its own id, then reload
    res.set('Cache-Control', 'no-store');
    return res.send(`<!doctype html><script>document.cookie='uid=web-'+crypto.randomUUID()+'; max-age=2592000; path=/; samesite=lax';location.reload()</script>`);
  }
  let variant = 'control';
  try { if ((await fs.getIdentityFlags(uid)).getFlag(EXP_FLAG)?.value === 'b') variant = 'b'; } catch (e) { console.error(e.message); }
  res.set('Cache-Control', (await bugOn()) ? 'public, max-age=5' : 'private, no-store');
  res.send(page(variant));
});

app.post('/seen', async (req, res) => {
  const { uid, assigned, shown } = req.body || {};
  if (!uid || !['control', 'b'].includes(assigned) || !['control', 'b'].includes(shown)) return res.status(400).end();
  const on = await bugOn(), s = stats[on ? 'on' : 'off'], mis = assigned !== shown;
  s.views++; if (mis) s.mis++;
  appendFileSync(LEDGER, [new Date().toISOString(), uid, on, assigned, shown, mis].join(',') + '\n');
  res.json({ ok: true });
});
app.get('/stats', async (_, res) => res.json({ bug_on: await bugOn(), ...stats }));
app.get('/ledger.csv', (_, res) => res.type('text/csv').send(readFileSync(LEDGER)));
app.listen(3000, () => console.log('live app on :3000'));

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function page(variant) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cached Out — are you in the wrong arm?</title>
<style>body{font:17px/1.5 system-ui;max-width:680px;margin:6vh auto;padding:0 18px;color:#111}
.card{border:1px solid #ddd;border-radius:12px;padding:22px;margin:18px 0}h1{font-size:26px;margin:.2em 0}
#verdict{border-radius:12px;padding:18px;font-size:19px;display:none}.bad{background:#fde8e8;border:2px solid #e02424}
.good{background:#e7f8ee;border:2px solid #0e9f6e}button{font-size:17px;padding:10px 18px;border-radius:8px;cursor:pointer}
small,.muted{color:#666}code{background:#f3f3f3;padding:1px 5px;border-radius:4px}</style></head>
<body data-variant="${variant}">
<div class="muted">A real Flagsmith A/B test. Headline ${variant === 'b' ? 'B' : 'A'} is on screen:</div>
<div class="card"><h1>${esc(H[variant])}</h1><button id="read">Read the story →</button> <span id="thanks" hidden>Counted.</span></div>
<div id="verdict"></div>
<p id="history" class="muted"></p>
<p id="live" class="muted"></p>
<p class="muted">How: this page sits behind nginx with its <b>default</b> cache key, which ignores cookies. A Flagsmith flag,
<code>cache_bug_on</code>, makes the app send <code>Cache-Control: public, max-age=5</code>, so for 5 seconds everyone gets the
same page, whatever Flagsmith assigned them. Refresh a few times. <a href="https://github.com/TheNandinee/cached-out">Code and full results</a> ·
<a href="/ledger.csv">every view, as CSV</a></p>
<small>Headlines: Upworthy Research Archive, CC BY 4.0. A background visitor loads this page every 2 s to stand in for normal traffic.</small>
<script type="module">
import flagsmith from 'https://esm.sh/@flagsmith/flagsmith@12';
const L = { control: 'Headline A', b: 'Headline B' };
const shown = document.body.dataset.variant;
const uid = (document.cookie.match(/(?:^|; )uid=([^;]+)/) || [])[1];
await flagsmith.init({ environmentID: '${process.env.FS_CLIENT_KEY}', enableEvents: true });
await flagsmith.identify(uid);
const f = flagsmith.getExperimentFlag('${EXP_FLAG}');
const assigned = f?.value === 'b' ? 'b' : 'control';
if (shown === 'b') flagsmith.trackEvent('rendered_b');
const v = document.getElementById('verdict'); v.style.display = 'block';
if (assigned !== shown) { v.className = 'bad';
  v.innerHTML = '🚨 <b>You were just mislabelled.</b> Flagsmith recorded you in <b>' + L[assigned] + '</b>, but you are looking at <b>' + L[shown] + '</b>. If you click, your click is credited to a headline you never saw.';
} else { v.className = 'good'; v.innerHTML = '✅ Flagsmith recorded you correctly: <b>' + L[assigned] + '</b>. Refresh in a few seconds; it may not stay that way.'; }
let h = []; try { h = JSON.parse(localStorage.getItem('h') || '[]'); } catch {}
h.push(shown === 'b' ? 'B' : 'A'); h = h.slice(-8); try { localStorage.setItem('h', JSON.stringify(h)); } catch {}
document.getElementById('history').innerHTML = 'What you have seen: <b>' + h.join(' → ') + '</b> · What Flagsmith thinks you saw, every time: <b>' + L[assigned] + '</b>';
fetch('/seen', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uid, assigned, shown }) })
  .then(() => fetch('/stats')).then(r => r.json()).then(s => {
    const p = x => x.views ? Math.round(100 * x.mis / x.views) + '% of ' + x.views + ' views' : 'no views yet';
    document.getElementById('live').innerHTML = 'Bug flag is <b>' + (s.bug_on ? 'ON' : 'OFF') + '</b>. Real visitors mislabelled so far: bug ON ' + p(s.on) + ' · bug OFF ' + p(s.off) + '.';
  });
document.getElementById('read').onclick = async () => { flagsmith.trackEvent('headline_click'); await flagsmith.flushEvents(); document.getElementById('thanks').hidden = false; };
addEventListener('pagehide', () => flagsmith.flushEvents());
</script></body></html>`;
}
