import express from 'express';
import cookieParser from 'cookie-parser';
import { createHash } from 'node:crypto';
import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'node:fs';
import * as fsmod from '@flagsmith/nodejs';

const Flagsmith = fsmod.Flagsmith ?? fsmod.default;
const fs = new Flagsmith({ environmentKey: process.env.FS_SERVER_KEY });
const H = JSON.parse(readFileSync(new URL('./headlines.json', import.meta.url)));
const EXP_FLAG = 'headline_live', BUG_FLAG = 'cache_bug_on';
const REPO = 'https://github.com/TheNandinee/cached-out';
const LEDGER = '/tmp/live_ledger.csv';
if (!existsSync(LEDGER)) writeFileSync(LEDGER, 'time,visitor,bug_on,assigned,shown,mislabelled\n');
const stats = { on: { views: 0, mis: 0 }, off: { views: 0, mis: 0 } };
const recent = [];
const id4 = s => createHash('sha256').update(String(s)).digest('hex').slice(0, 4);

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
  if (!uid) {
    res.set('Cache-Control', 'no-store');
    return res.send(`<!doctype html><meta charset="utf-8"><style>body{background:#0A0805}</style><script>document.cookie='uid=web-'+crypto.randomUUID()+'; max-age=2592000; path=/; samesite=lax';location.reload()</script>`);
  }
  let variant = 'control';
  try { if ((await fs.getIdentityFlags(uid)).getFlag(EXP_FLAG)?.value === 'b') variant = 'b'; } catch (e) { console.error(e.message); }
  res.set('Cache-Control', (await bugOn()) ? 'public, max-age=5' : 'private, no-store');
  res.send(page(variant, id4(uid), Date.now()));
});

app.post('/seen', async (req, res) => {
  const { uid, assigned, shown } = req.body || {};
  if (!uid || !['control', 'b'].includes(assigned) || !['control', 'b'].includes(shown)) return res.status(400).end();
  const on = await bugOn(), s = stats[on ? 'on' : 'off'], mis = assigned !== shown;
  s.views++; if (mis) s.mis++;
  const row = { t: Date.now(), v: id4(uid), on, a: assigned, s: shown, m: mis };
  recent.unshift(row); recent.length = Math.min(recent.length, 12);
  appendFileSync(LEDGER, [new Date().toISOString(), row.v, on, assigned, shown, mis].join(',') + '\n');
  res.json({ ok: true });
});
const ADMIN = process.env.FS_ADMIN_KEY, BUG_ID = process.env.BUG_FEATURE_ID || '307306', ENV_KEY = process.env.FS_CLIENT_KEY;
let lastFlip = 0, restoreAt = null, restoreTimer = null;
async function setBug(on) {
  const r = await fetch('https://api.flagsmith.com/api/__future__/environments/' + ENV_KEY + '/features/' + BUG_ID + '/', {
    method: 'PATCH', headers: { Authorization: 'Api-Key ' + ADMIN, 'content-type': 'application/json' },
    body: JSON.stringify({ environment_default: { enabled: on } }) });
  if (!r.ok) throw new Error('Flagsmith Admin API ' + r.status + ': ' + (await r.text()).slice(0, 160));
  bug = { v: on, t: Date.now() + 13000 };   // trust our own write while Flagsmith propagates it
}
app.post('/flip', async (req, res) => {
  if (!ADMIN) return res.status(503).json({ error: 'This deployment has no Flagsmith admin key, so the flag can only be flipped from the Flagsmith dashboard.' });
  if (Date.now() - lastFlip < 5000) return res.status(429).json({ error: 'Someone just flipped the flag. Try again in a few seconds.' });
  const on = !!(req.body || {}).on; lastFlip = Date.now();
  try {
    await setBug(on);
    clearTimeout(restoreTimer); restoreAt = null;
    if (!on) { restoreAt = Date.now() + 60000; restoreTimer = setTimeout(() => { restoreAt = null; setBug(true).catch(e => console.error(e.message)); }, 60000); }
    res.json({ ok: true, bug_on: on, restore_at: restoreAt });
  } catch (e) { console.error(e.message); res.status(502).json({ error: e.message }); }
});
app.get('/stats', async (_, res) => res.json({ bug_on: await bugOn(), ...stats, recent, restore_at: restoreAt, can_flip: !!ADMIN }));
app.get('/ledger.csv', (_, res) => res.type('text/csv').send(readFileSync(LEDGER)));
app.listen(3000, () => console.log('live app on :3000'));

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

function page(variant, forId, at) {
  const HJSON = JSON.stringify({ control: H.control, b: H.b }).replace(/</g, '\\u003c');
  const letter = variant === 'b' ? 'B' : 'A';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>cached-out: did a cache just put you on the wrong side of an A/B test?</title>
<meta name="description" content="A live Flagsmith experiment behind a misconfigured cache. Open it and see whether Flagsmith logged the headline you were actually served.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&family=VT323&display=swap" rel="stylesheet">
<style>
:root{--bg:#0A0805;--amber:#FFB43A;--amber2:#FFD28A;--dim:#9B7A3E;--line:#3B2D15;--cyan:#59E6F2;--red:#FF4B3E;--green:#86E58F}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;color:var(--amber);font:400 15px/1.65 "IBM Plex Mono",ui-monospace,Menlo,monospace;text-shadow:0 0 5px rgba(255,180,58,.35);animation:flicker 4s infinite steps(1)}
body::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:50;background:repeating-linear-gradient(rgba(0,0,0,.22) 0 1px,transparent 1px 3px)}
body::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:51;background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.55) 100%)}
@keyframes flicker{0%{opacity:1}92%{opacity:1}93%{opacity:.93}94%{opacity:1}}
a{color:var(--cyan)}
:focus-visible{outline:2px solid var(--cyan);outline-offset:3px}
.screen{max-width:1180px;margin:0 auto;padding:0 28px 80px}
.bar{display:flex;align-items:center;gap:8px;padding:16px 0;border-bottom:1px solid var(--line);color:var(--dim);font-size:13px}
.bar i{width:11px;height:11px;border-radius:50%;background:var(--line);display:inline-block}
.bar i:first-child{background:var(--red)}.bar i:nth-child(2){background:var(--amber)}.bar i:nth-child(3){background:var(--green)}
.bar .t{margin-left:12px}.bar nav{margin-left:auto}.bar nav a{margin-left:18px;color:var(--amber);text-decoration:none}
.bar nav a:hover{color:var(--amber2)}
.boot{margin:26px 0 0;min-height:7.5em;color:var(--dim);font-size:14px}
.boot div{white-space:pre-wrap}
.boot .ok{color:var(--green)}
h1{font-family:VT323,monospace;font-weight:400;font-size:clamp(54px,8.4vw,118px);line-height:.92;margin:18px 0 18px;color:var(--amber2);text-shadow:0 0 10px rgba(255,180,58,.6),0 0 30px rgba(255,140,0,.25);max-width:15ch;min-height:1.84em}
.cursor{display:inline-block;width:.5em;height:.82em;background:currentColor;margin-left:.08em;vertical-align:-.05em;animation:blink 1s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
.dek{color:var(--amber);opacity:.85;max-width:72ch;margin:0 0 40px;font-size:16px}
.term{border:1px solid var(--line);padding:22px 24px;background:rgba(255,180,58,.025)}
.cmd{color:var(--amber2)}.cmd::before{content:"$ ";color:var(--dim)}
.out{margin:2px 0 16px;padding-left:16px;border-left:2px solid var(--line)}
.out.cy{color:var(--cyan);text-shadow:0 0 6px rgba(89,230,242,.4);border-left-color:rgba(89,230,242,.35)}
.out .hl{font-family:VT323,monospace;font-size:clamp(26px,2.6vw,34px);line-height:1.1;display:block;margin:6px 0}
.out .meta{color:var(--dim);font-size:13.5px}
.out .meta b{color:var(--red);font-weight:700}
.diff{margin:4px 0 0;font-size:16px}
.diff .m{color:var(--red);text-shadow:0 0 6px rgba(255,75,62,.45)}.diff .p{color:var(--cyan)}.diff .e{color:var(--green)}
.hidden{visibility:hidden}
.banner{font-family:VT323,monospace;font-size:clamp(64px,11vw,150px);line-height:.9;margin:26px 0 6px;position:relative;display:inline-block;letter-spacing:.02em}
.banner.bad{color:var(--red);text-shadow:0 0 14px rgba(255,75,62,.7)}
.banner.good{color:var(--green);text-shadow:0 0 14px rgba(134,229,143,.55);font-size:clamp(48px,7vw,96px)}
.banner.bad::before,.banner.bad::after{content:attr(data-t);position:absolute;inset:0;pointer-events:none}
.banner.bad::before{color:var(--cyan);transform:translate(3px,0);clip-path:inset(0 0 55% 0);mix-blend-mode:screen;animation:g1 1.6s infinite steps(2)}
.banner.bad::after{color:#ff00a8;transform:translate(-3px,0);clip-path:inset(55% 0 0 0);mix-blend-mode:screen;animation:g2 1.3s infinite steps(2)}
@keyframes g1{0%{clip-path:inset(0 0 70% 0)}50%{clip-path:inset(30% 0 40% 0)}100%{clip-path:inset(10% 0 60% 0)}}
@keyframes g2{0%{clip-path:inset(60% 0 0 0)}50%{clip-path:inset(40% 0 20% 0)}100%{clip-path:inset(75% 0 5% 0)}}
.shake{animation:shake .5s cubic-bezier(.36,.07,.19,.97)}
@keyframes shake{10%,90%{transform:translate(-2px,1px)}20%,80%{transform:translate(4px,-1px)}30%,50%,70%{transform:translate(-6px,2px)}40%,60%{transform:translate(6px,-2px)}}
.verdict{font-size:clamp(17px,1.7vw,20px);max-width:64ch;color:var(--amber2);margin:6px 0 0}
.verdict b{color:var(--red)}
.keys{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin:28px 0 0}
.btn{font:700 15px "IBM Plex Mono",monospace;color:var(--bg);background:var(--amber);border:0;padding:12px 18px;cursor:pointer;text-shadow:none;box-shadow:0 0 18px rgba(255,180,58,.35)}
.btn:hover{background:var(--amber2)}
.btn[disabled]{background:var(--line);color:var(--dim);box-shadow:none;cursor:wait}
.btn.ghost{background:transparent;color:var(--amber);border:1px solid var(--amber);box-shadow:none}
.btn.ghost[disabled]{color:var(--green);border-color:var(--green);cursor:default}
.hist{color:var(--dim);font-size:14px;margin-left:6px}
.hist span{display:inline-block;margin-left:6px;padding:0 6px;border:1px solid var(--line)}
.hist .x{color:var(--red);border-color:var(--red)}.hist .o{color:var(--green);border-color:rgba(134,229,143,.5)}
.grid{display:grid;grid-template-columns:1.1fr 1fr;gap:26px;margin-top:46px}
.box{border:1px solid var(--line);padding:18px 20px;position:relative}
.box .lbl{position:absolute;top:-.8em;left:14px;background:var(--bg);padding:0 8px;color:var(--dim);font-size:13px}
.flag{font-size:17px}
.flag .k{color:var(--amber2)}.flag .on{color:var(--red)}.flag .off{color:var(--green)}
.nums{display:flex;gap:34px;margin-top:14px}
.nums div{font-family:VT323,monospace;font-size:62px;line-height:1;color:var(--amber2)}
.nums small{display:block;font-family:"IBM Plex Mono",monospace;font-size:12.5px;color:var(--dim);line-height:1.45;margin-top:6px;max-width:22ch}
.feed{font-size:13.5px;max-height:15.5em;overflow:hidden}
.feed div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;animation:in .4s ease}
.feed .x{color:var(--red)}.feed .sys{color:var(--cyan)}
@keyframes in{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
.flash{animation:flash .9s ease}
@keyframes flash{0%{background:rgba(89,230,242,.25)}100%{background:transparent}}
section{margin-top:110px}
h2{font-family:VT323,monospace;font-weight:400;font-size:clamp(40px,5vw,64px);line-height:1;color:var(--amber2);margin:0 0 22px}
h2::before{content:"# ";color:var(--dim)}
.steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
.steps li{border:1px solid var(--line);padding:18px 20px}
.steps li b{display:block;font-family:VT323,monospace;font-weight:400;font-size:42px;line-height:1;color:var(--cyan);margin-bottom:8px}
.steps h3{font-size:15px;margin:0 0 8px;color:var(--amber2)}
.steps p{margin:0;font-size:14px;opacity:.88}
code{color:var(--cyan)}
table{width:100%;border-collapse:collapse;font-size:15px}
th,td{text-align:left;padding:11px 14px 11px 0;border-bottom:1px dashed var(--line)}
th{color:var(--dim);font-weight:400}
td.n{font-family:VT323,monospace;font-size:30px;color:var(--amber2)}
td.r{color:var(--red)}
.sub{opacity:.85;max-width:70ch;margin:-6px 0 22px;font-size:14.5px}
.reveal{opacity:0;transform:translateY(14px);transition:opacity .7s ease,transform .7s ease}
.reveal.on{opacity:1;transform:none}
.fix{display:grid;grid-template-columns:1fr 1fr;gap:34px;align-items:start}
pre{margin:0;border:1px solid var(--line);padding:18px 20px;color:var(--amber2);overflow:auto;font-size:14px}
pre i{color:var(--dim);font-style:normal}
.meter{margin:0 0 22px}
.meter div:first-child{font-size:14px;color:var(--dim);margin-bottom:4px}
.blocks{font-size:20px;letter-spacing:-1px;white-space:nowrap;overflow:hidden}
.blocks.g{color:var(--green)}.blocks.r{color:var(--red);text-shadow:0 0 8px rgba(255,75,62,.5)}
.blocks em{font-style:normal;color:var(--line)}
.pct{font-family:VT323,monospace;font-size:44px;line-height:1;margin-left:10px;vertical-align:-6px}
footer{margin-top:100px;padding-top:20px;border-top:1px solid var(--line);color:var(--dim);font-size:13px}
footer p{margin:0 0 6px;max-width:96ch}
.fliprow{margin-top:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:13.5px;color:var(--dim)}.btn.small{padding:9px 14px;font-size:14px}
@media (max-width:860px){.grid,.fix,.steps{grid-template-columns:1fr}.bar .t{display:none}.nums div{font-size:48px}.screen{padding:0 18px 60px}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.reveal{opacity:1;transform:none}.hidden{visibility:visible}}
</style></head>
<body data-variant="${variant}" data-for="${forId}" data-at="${at}">
<div class="screen" id="screen">
<div class="bar"><i></i><i></i><i></i><span class="t">cached-out — live experiment — flagsmith</span>
<nav><a href="${REPO}">source</a><a href="/ledger.csv">ledger.csv</a></nav></div>

<div class="boot" id="boot" aria-hidden="true"></div>
<h1 id="h1" aria-label="Did a cache just put you on the wrong side of an A/B test?"></h1>
<p class="dek">This page is a live Flagsmith experiment between two real Upworthy headlines, served through a cache set up the way many sites are. Below: the page you were served, what Flagsmith logged about you, and the difference.</p>

<div class="term" id="term">
  <div class="cmd" id="c1"></div>
  <div class="out hidden" id="o1"><span class="meta" id="m1"></span><span class="hl">${esc(H[variant])}</span></div>
  <div class="cmd" id="c2"></div>
  <div class="out cy hidden" id="o2"><span class="meta" id="m2"></span><span class="hl" id="rt"></span><span class="meta">your clicks are credited to this headline</span></div>
  <div class="cmd" id="c3"></div>
  <div class="diff hidden" id="o3"></div>
</div>

<div class="banner hidden" id="banner"></div>
<p class="verdict" id="verdict" aria-live="polite"></p>

<div class="keys">
  <button class="btn" id="again" disabled>new copy in 5s</button>
  <button class="btn ghost" id="read">read the story</button>
  <span class="hist" id="hist"></span>
</div>

<div class="grid">
  <div class="box"><span class="lbl">flagsmith flag</span>
    <div class="flag" id="flag"><span class="k">cache_bug_on</span> = <span class="on">…</span></div>
    <div class="fliprow"><button class="btn small" id="flipbtn" hidden>turn the bug off for everyone</button><span id="fliptxt"></span></div>
    <div class="nums"><div id="on">–<small>real visits mislabelled with the bug flag on</small></div><div id="off">–<small>real visits mislabelled with it off</small></div></div>
  </div>
  <div class="box"><span class="lbl">live visits, newest first</span><div class="feed" id="feed"><div>waiting for visits…</div></div></div>
</div>

<section class="reveal">
<h2>how a cache rewrites an experiment</h2>
<ol class="steps">
<li><b>1</b><h3>flagsmith assigns you</h3><p>Every visitor is fixed to headline A or B, and the exposure is logged under that headline.</p></li>
<li><b>2</b><h3>the cache answers instead</h3><p>The Flagsmith flag <code>cache_bug_on</code> makes the app send <code>Cache-Control: public</code>. The cache key ignores cookies, so one visitor's page goes to everyone for 5 seconds.</p></li>
<li><b>3</b><h3>your click lands in the wrong column</h3><p>You read one headline and get counted under the other. The split still looks 50/50, so a sample-ratio check has nothing to catch.</p></li>
</ol>
</section>

<section class="reveal">
<h2>what it did to a controlled test</h2>
<p class="sub">3,000 simulated visitors per run, with a planted effect: people who actually see B click more. Same code, same Flagsmith experiment, three seeds, pre-registered before any data.</p>
<table>
<thead><tr><th>seed</th><th>exposures mislabelled</th><th>real effect of B</th><th>effect flagsmith saw</th><th>flagsmith: chance B wins</th></tr></thead>
<tbody>
<tr><td>1</td><td class="n">47%</td><td>+2.2 pts</td><td>+0.4 pts</td><td>63.4%</td></tr>
<tr><td>2</td><td class="n">47%</td><td>+2.5 pts</td><td>+1.1 pts</td><td>82.9%</td></tr>
<tr><td>3</td><td class="n">45%</td><td>+2.8 pts</td><td class="r">−0.4 pts, reversed</td><td class="r">37.4%</td></tr>
</tbody></table>
</section>

<section class="reveal"><div class="fix">
<div><h2>the fix is one event</h2>
<p class="sub" style="margin-top:0">Record what is actually on screen and add it to the experiment as a second metric. In a healthy test, nobody logged as A ever sees B.</p>
<pre><i>// records the exposure</i>
const flag = flagsmith.getExperimentFlag('headline');
<i>// the guardrail</i>
if (rendered === 'b') flagsmith.trackEvent('rendered_b');</pre></div>
<div role="img" aria-label="Visitors logged as A who saw B: 0 percent when healthy, 39.6 percent with the cache bug">
  <div class="meter"><div>healthy: logged as A, saw B</div><span class="blocks g" data-p="0"></span><span class="pct">0%</span></div>
  <div class="meter"><div>cache bug: logged as A, saw B</div><span class="blocks r" data-p="39.6"></span><span class="pct" style="color:var(--red)">39.6%</span></div>
  <p class="sub" style="margin:0">measured inside flagsmith, 3,000 visitors per run</p>
</div></div></section>

<footer>
<p>Built for Toggle Wars, Track 1, on Flagsmith Experimentation. A background visitor loads this page every 2 seconds to stand in for ordinary traffic. It runs no scripts and is never counted.</p>
<p>Headlines: Upworthy Research Archive (Matias, Munger, Aubin Le Quere, Ebersole), CC BY 4.0. In 2013 a cache serving one version at a time may have affected 7,004 of Upworthy's own tests.</p>
<p><a href="${REPO}">source, pre-registration and every result</a></p>
</footer>
</div>

<script type="module">
const H = ${HJSON};
const L = { control: 'A', b: 'B' };
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const body = document.body, shown = body.dataset.variant, builtFor = body.dataset.for, builtAt = +body.dataset.at;
const uid = (document.cookie.match(/(?:^|; )uid=([^;]+)/) || [])[1];
const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, RM ? 0 : ms));
async function type(el, text, speed) {
  if (RM) { el.textContent = text; return; }
  const cur = document.createElement('span'); cur.className = 'cursor';
  el.textContent = ''; el.appendChild(cur);
  for (let i = 0; i < text.length; i++) { cur.insertAdjacentText('beforebegin', text[i]); await new Promise(r => setTimeout(r, speed)); }
  cur.remove();
}
async function hex4(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(b)).slice(0, 2).map(x => x.toString(16).padStart(2, '0')).join(''); }

let tleft = 5; const again = $('again');
const tk = setInterval(() => { tleft--; if (tleft <= 0) { clearInterval(tk); again.disabled = false; again.textContent = 'load the page again'; } else again.textContent = 'new copy in ' + tleft + 's'; }, 1000);
again.onclick = () => location.reload();

const flagsmithP = import('https://esm.sh/@flagsmith/flagsmith@12').then(async m => {
  const f = m.default; await f.init({ environmentID: '${process.env.FS_CLIENT_KEY}', enableEvents: true }); await f.identify(uid); return f; });
const meP = hex4(uid);

const boot = $('boot');
for (const line of ['cached-out v1 · tty0', 'connecting to flagsmith edge … ok', 'loading experiment headline_live … ok']) {
  const d = document.createElement('div'); boot.appendChild(d); await type(d, line, 12);
}
boot.lastChild.classList.add('ok');
await type($('h1'), 'Did a cache just put you on the wrong side of an A/B test?', 26);

const me = await meP;
let flagsmith; try { flagsmith = await flagsmithP; } catch (e) { $('verdict').textContent = 'Could not reach Flagsmith. Load the page again.'; throw e; }
const fl = flagsmith.getExperimentFlag('${EXP_FLAG}');
const assigned = fl?.value === 'b' ? 'b' : 'control';
if (shown === 'b') flagsmith.trackEvent('rendered_b');
const mis = assigned !== shown;
const age = Math.max(0, (Date.now() - builtAt) / 1000).toFixed(1);
const mine = builtFor === me;

await type($('c1'), 'curl -s ' + location.host + '/   # the page you were served', 14);
$('m1').innerHTML = 'served: headline ' + L[shown] + ' · built ' + age + ' s ago for visitor #' + builtFor + (mine ? ' (you)' : ' — <b>not you</b>');
$('o1').classList.remove('hidden'); await wait(380);
await type($('c2'), "flagsmith.getExperimentFlag('${EXP_FLAG}')   # what flagsmith logged", 14);
$('m2').textContent = 'logged: headline ' + L[assigned] + ' · identity #' + me + ' (you)';
$('rt').textContent = H[assigned];
$('o2').classList.remove('hidden'); await wait(380);
await type($('c3'), 'diff served logged', 22);
$('o3').innerHTML = mis
  ? '<div class="m">- served: headline ' + L[shown] + '</div><div class="p">+ logged: headline ' + L[assigned] + '</div>'
  : '<div class="e">  no differences: served and logged are both headline ' + L[shown] + '</div>';
$('o3').classList.remove('hidden'); await wait(260);

const bn = $('banner');
bn.textContent = mis ? 'MISLABELLED' : 'MATCH'; bn.dataset.t = bn.textContent;
bn.className = 'banner ' + (mis ? 'bad' : 'good');
if (mis && !RM) { $('screen').classList.add('shake'); setTimeout(() => $('screen').classList.remove('shake'), 600); }
$('verdict').innerHTML = mis
  ? 'You were served headline ' + L[shown] + (mine ? '' : ', built for someone else') + '. Flagsmith logged you under <b>headline ' + L[assigned] + '</b>. Click, and the click counts for a headline you never saw.'
  : 'This copy matches. The cache hands everyone the same page for 5 seconds, so load it again when the timer runs out.';

let hist = []; try { hist = JSON.parse(localStorage.getItem('co_hist') || '[]'); } catch {}
hist.push({ s: L[shown], m: mis }); hist = hist.slice(-10);
try { localStorage.setItem('co_hist', JSON.stringify(hist)); } catch {}
$('hist').innerHTML = 'your visits' + hist.map(h => '<span class="' + (h.m ? 'x' : 'o') + '">' + h.s + (h.m ? '✗' : '✓') + '</span>').join('');

let flipMsg = null;
let lastBug = null;
function countUp(el, target, label) {
  const small = '<small>' + label + '</small>';
  if (target === null) { el.innerHTML = '–' + small; return; }
  if (RM) { el.innerHTML = target + '%' + small; return; }
  const start = performance.now();
  (function step(t) { const k = Math.min(1, (t - start) / 700); el.innerHTML = Math.round(target * k) + '%' + small; if (k < 1) requestAnimationFrame(step); })(start);
}
function feedLine(cls, txt) { const d = document.createElement('div'); if (cls) d.className = cls; d.textContent = txt; return d; }
async function poll(first) {
  try {
    const s = await (await fetch('/stats', { cache: 'no-store' })).json();
    const fe = $('flag');
    fe.innerHTML = '<span class="k">cache_bug_on</span> = <span class="' + (s.bug_on ? 'on' : 'off') + '">' + s.bug_on + '</span>';
    const feed = $('feed');
    if (lastBug !== null && lastBug !== s.bug_on) {
      fe.classList.remove('flash'); void fe.offsetWidth; fe.classList.add('flash');
      feed.prepend(feedLine('sys', '[flagsmith] cache_bug_on: ' + lastBug + ' → ' + s.bug_on));
    }
    lastBug = s.bug_on;
    const fb = $('flipbtn'), ft = $('fliptxt');
    if (s.can_flip) { fb.hidden = false; fb.textContent = s.bug_on ? 'turn the bug off for everyone' : 'turn the bug back on'; fb.dataset.on = s.bug_on ? '0' : '1'; }
    ft.textContent = flipMsg || (s.restore_at ? 'turns itself back on in ' + Math.max(0, Math.round((s.restore_at - Date.now()) / 1000)) + ' s, so the next visitor can try it'
      : (s.can_flip ? 'calls the Flagsmith Admin API and changes the flag for every visitor' : 'flip it from the Flagsmith dashboard'));
    const p = x => x.views ? Math.round(100 * x.mis / x.views) : null;
    if (first) { countUp($('on'), p(s.on), 'real visits mislabelled with the bug flag on (' + s.on.views + ')'); countUp($('off'), p(s.off), 'real visits mislabelled with it off (' + s.off.views + ')'); }
    else { $('on').innerHTML = (p(s.on) === null ? '–' : p(s.on) + '%') + '<small>real visits mislabelled with the bug flag on (' + s.on.views + ')</small>'; $('off').innerHTML = (p(s.off) === null ? '–' : p(s.off) + '%') + '<small>real visits mislabelled with it off (' + s.off.views + ')</small>'; }
    const sys = Array.from(feed.querySelectorAll('.sys')).slice(0, 3);
    feed.innerHTML = '';
    sys.forEach(x => feed.appendChild(x));
    (s.recent.length ? s.recent : []).forEach(r => {
      const tm = new Date(r.t).toTimeString().slice(0, 8);
      feed.appendChild(feedLine(r.m ? 'x' : '', tm + '  #' + r.v + '  served ' + L[r.s] + '  logged ' + L[r.a] + (r.m ? '  ✗ mislabelled' : '  ✓') + (r.on ? '' : '  (flag off)')));
    });
    if (!feed.children.length) feed.appendChild(feedLine('', 'waiting for visits…'));
  } catch {}
}
fetch('/seen', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uid, assigned, shown }) }).then(() => poll(true));
setInterval(() => poll(false), 3000);

$('flipbtn').onclick = async () => {
  const b = $('flipbtn'); b.disabled = true;
  try {
    const r = await fetch('/flip', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: b.dataset.on === '1' }) });
    const j = await r.json();
    flipMsg = r.ok ? 'Flagsmith answered 200. Cached copies expire within 5 s, then load the page again.' : (j.error || 'Could not flip the flag.');
  } catch { flipMsg = 'Could not reach the server.'; }
  $('fliptxt').textContent = flipMsg; setTimeout(() => { flipMsg = null; }, 8000);
  b.disabled = false; poll(false);
};
$('read').onclick = async () => { flagsmith.trackEvent('headline_click'); await flagsmith.flushEvents(); $('read').disabled = true; $('read').textContent = 'counted for headline ' + L[assigned]; };
addEventListener('pagehide', () => flagsmith.flushEvents());

const io = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return; e.target.classList.add('on'); io.unobserve(e.target);
  e.target.querySelectorAll('.blocks').forEach(b => {
    const total = 30, full = Math.round(total * (+b.dataset.p) / 100);
    if (RM) { b.innerHTML = '█'.repeat(full) + '<em>' + '░'.repeat(total - full) + '</em>'; return; }
    let i = 0; const iv = setInterval(() => { b.innerHTML = '█'.repeat(Math.min(i, full)) + '<em>' + '░'.repeat(total - Math.min(i, full)) + '</em>'; if (i++ >= full) clearInterval(iv); }, 40);
  });
}), { threshold: .25 });
document.querySelectorAll('.reveal').forEach(s => io.observe(s));
</script>
</body></html>`;
}
