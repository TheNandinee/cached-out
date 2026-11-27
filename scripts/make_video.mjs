// usage: node scripts/make_video.mjs  → docs/cached-out-demo.mp4 + docs/cached-out-demo.srt
// Voice files (optional): docs/vo/vo1.mp3 … vo7.mp3 (mp3, m4a, wav, aac, mp4 or mov). Without them: a silent preview.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';

const W = 1280, H = 720, OUT = 'docs/.video';
const REPO = 'https://github.com/TheNandinee/cached-out';
const LIVE = existsSync('.live_url') ? readFileSync('.live_url', 'utf8').trim().replace(/\/$/, '') : REPO;
const VO = JSON.parse(readFileSync('scripts/vo.json', 'utf8'));
mkdirSync(OUT, { recursive: true }); mkdirSync('docs/vo', { recursive: true });

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
const dur = f => parseFloat(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]));
const voFile = n => ['mp3', 'm4a', 'wav', 'aac', 'mp4', 'mov'].map(e => `docs/vo/vo${n}.${e}`).find(existsSync);

const CSS = (secs) => `
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#0A0805;color:#FFB43A;font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace}
body::after{content:"";position:fixed;inset:0;pointer-events:none;background:repeating-linear-gradient(rgba(0,0,0,.22) 0 1px,transparent 1px 3px)}
body::before{content:"";position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 60%,rgba(0,0,0,.6) 100%);z-index:2}
h1{margin:0;padding:38px 60px 0;font:400 54px/1 VT323,monospace;color:#FFD28A;text-shadow:0 0 12px rgba(255,180,58,.55)}
h1::before{content:"# ";color:#9B7A3E}
.sub{padding:10px 60px 0;color:#9B7A3E;font-size:19px}
.img{position:absolute;left:60px;right:60px;top:150px;bottom:36px;display:flex;align-items:center;justify-content:center}
.img img{max-width:100%;max-height:100%;opacity:0;animation:kb ${secs}s ease-out forwards}
@keyframes kb{0%{opacity:0;transform:scale(.965)}7%{opacity:1}100%{opacity:1;transform:scale(1.045)}}
.type{overflow:hidden;white-space:nowrap;width:0;animation:ty 1.1s steps(40) forwards}
@keyframes ty{to{width:100%}}`;
const FONTS = '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=VT323&display=swap" rel="stylesheet">';
const card = (title, sub, img) => secs => `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${CSS(secs)}</style></head>
<body><h1 class="type">${title}</h1><div class="sub">${sub}</div><div class="img"><img src="${img}"></div></body></html>`;
const outro = secs => `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${CSS(secs)}
.o{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:0 90px}
.big{font:400 150px/.9 VT323,monospace;color:#FFD28A;text-shadow:0 0 18px rgba(255,180,58,.6);opacity:0;animation:in .8s .2s forwards}
.row{margin-top:26px;font-size:24px;opacity:0;animation:in .8s forwards}.row b{color:#59E6F2;font-weight:600}
.r1{animation-delay:.9s}.r2{animation-delay:1.4s}.r3{animation-delay:1.9s;color:#9B7A3E;font-size:19px}
.mini{display:inline-block;width:92px;height:46px;border:5px solid #FFD28A;border-radius:999px;position:relative;vertical-align:-2px;margin:0 6px;box-shadow:0 0 16px rgba(255,180,58,.5)}
.mini::after{content:"";position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;background:#FF4B3E;box-shadow:0 0 14px #FF4B3E;animation:flip 1s 2.6s forwards}
@keyframes flip{to{right:56px;background:#86E58F;box-shadow:0 0 14px #86E58F}}
@keyframes in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}</style></head>
<body><div class="o"><div class="big">cached-<span class="mini"></span>ut</div>
<div class="row r1">live demo &nbsp;<b>${LIVE.replace(/^https?:\/\//, '')}</b></div>
<div class="row r2">code &nbsp;<b>${REPO.replace(/^https?:\/\//, '')}</b></div>
<div class="row r3">Toggle Wars, Track 1 · built on Flagsmith Experimentation</div></div></body></html>`;

const scenes = [
  { id: 'live', vo: [1, 2], type: 'clip', src: 'docs/.rec/demo.webm', def: 28 },
  { id: 'how', vo: [3], type: 'card', def: 19, html: card('how a cache rewrites an experiment', 'visitor B reads headline A, Flagsmith credits headline B', '../how.svg') },
  { id: 'effect', vo: [4], type: 'card', def: 25, html: card('what it did to a controlled test', '3,000 visitors per run, planted effect, three seeds', '../effect.svg') },
  { id: 'guard', vo: [5], type: 'card', def: 20, html: card('the fix is one event', "trackEvent('rendered_b') as a guardrail metric", '../guardrail.svg') },
  { id: 'repo', vo: [6], type: 'url', url: REPO, def: 21 },
  { id: 'outro', vo: [7], type: 'card', def: 11, html: outro },
];

if (!existsSync('docs/.rec/demo.webm')) { console.error('Missing docs/.rec/demo.webm. Run: ./scripts/capture.sh "$(cat .live_url)"'); process.exit(1); }

function sceneAudio(s) {
  const files = s.vo.map(voFile);
  if (files.some(f => !f)) return null;
  const out = `${OUT}/a_${s.id}.m4a`, args = ['-y', '-loglevel', 'error'];
  files.forEach(f => args.push('-i', f));
  args.push('-filter_complex', files.map((_, i) => `[${i}:a]`).join('') + `concat=n=${files.length}:v=0:a=1,apad=pad_dur=0.7[a]`,
    '-map', '[a]', '-ac', '2', '-ar', '48000', '-c:a', 'aac', out);
  sh('ffmpeg', args); return out;
}

async function record(browser, s, secs) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT, size: { width: W, height: H } }, colorScheme: 'dark' });
  const page = await ctx.newPage(); const video = page.video(); const t0 = Date.now(); let trim = 0.5;
  if (s.type === 'card') {
    const f = resolve(`${OUT}/${s.id}.html`); writeFileSync(f, s.html(secs));
    await page.goto('file://' + f, { waitUntil: 'networkidle' }).catch(() => {});
    trim = (Date.now() - t0) / 1000;
    await page.waitForTimeout(secs * 1000 + 500);
  } else {
    await page.goto(s.url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(600); trim = (Date.now() - t0) / 1000;
    await page.evaluate(ms => new Promise(done => {
      const max = Math.max(0, document.documentElement.scrollHeight * 0.7 - innerHeight), t0 = performance.now();
      (function step(t) { const k = Math.min(1, (t - t0) / ms); const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        scrollTo(0, max * e); k < 1 ? requestAnimationFrame(step) : done(); })(t0);
    }), Math.max(3000, secs * 1000 - 1200));
    await page.waitForTimeout(800);
  }
  await ctx.close(); const p = `${OUT}/v_${s.id}.webm`; renameSync(await video.path(), p);
  return { webm: p, trim };
}

function encode(s, webm, audio, secs, trim, factor = 1) {
  const out = `${OUT}/s_${s.id}.mp4`, args = ['-y', '-loglevel', 'error', '-ss', trim.toFixed(2), '-i', webm];
  if (audio) args.push('-i', audio); else args.push('-f', 'lavfi', '-t', String(secs), '-i', 'anullsrc=r=48000:cl=stereo');
  const vf = `[0:v]setpts=PTS/${factor.toFixed(3)},fps=30,scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
             `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0A0805,tpad=stop_mode=clone:stop_duration=90,format=yuv420p[v]`;
  args.push('-filter_complex', vf, '-map', '[v]', '-map', '1:a', '-t', secs.toFixed(2),
    '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-c:a', 'aac', '-ar', '48000', '-ac', '2', out);
  sh('ffmpeg', args); return out;
}

const browser = await chromium.launch();
const parts = [], timeline = [];
for (const s of scenes) {
  const audio = sceneAudio(s);
  const secs = audio ? dur(audio) : s.def;
  let out;
  if (s.type === 'clip') {
    const clip = dur(s.src) - 0.3, factor = Math.min(1.6, Math.max(1, clip / secs));
    out = encode(s, s.src, audio, secs, 0.3, factor);
  } else {
    const { webm, trim } = await record(browser, s, secs);
    out = encode(s, webm, audio, secs, trim);
  }
  parts.push(out); timeline.push({ s, secs });
  console.log(`${s.id.padEnd(7)} ${secs.toFixed(1)} s ${audio ? '(voice)' : '(silent preview)'}`);
}
await browser.close();

writeFileSync(`${OUT}/list.txt`, parts.map(p => `file '${resolve(p)}'`).join('\n'));
sh('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${OUT}/list.txt`, '-c', 'copy', '-movflags', '+faststart', 'docs/cached-out-demo.mp4']);

// subtitles: each scene's sentences spread across its voice time, by word count
const ts = x => { const ms = Math.round(x * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
let t = 0, i = 1, srt = '';
for (const { s, secs } of timeline) {
  const sent = s.vo.map(n => VO[n - 1]).join(' ').split(/(?<=[.!?:])\s+/);
  const words = sent.map(x => x.split(/\s+/).length), total = words.reduce((a, b) => a + b, 0), speak = secs - 0.7;
  let u = t;
  sent.forEach((x, k) => { const d = speak * words[k] / total; srt += `${i++}\n${ts(u)} --> ${ts(u + d)}\n${x}\n\n`; u += d; });
  t += secs;
}
writeFileSync('docs/cached-out-demo.srt', srt);
console.log(`\ndone: docs/cached-out-demo.mp4 (${t.toFixed(0)} s) + docs/cached-out-demo.srt`);
