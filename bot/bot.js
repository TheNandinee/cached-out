// usage: node bot/bot.js <run> <n> <rps> <seed>
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as fsmod from '@flagsmith/nodejs';

const Flagsmith = fsmod.Flagsmith ?? fsmod.default;
const [run = 'r1', N = '200', RPS = '8', SEED = '20261127'] = process.argv.slice(2);
const VERSION = process.env.FLAG_VERSION || 'v0';
const PORT = { r1: 8081, r2: 8082, r3: 8083, r4: 8084 }[run];
const MODE = { r1: 'assignment', r2: 'assignment', r3: 'rendered', r4: 'assignment' }[run];
const FLAG = `headline_${run}_${VERSION}`;
const P = { control: 0.10, b: 0.13 };            // planted truth, by what the visitor SAW
const LEDGER = `data/ledger_${VERSION}.csv`;

const fs = new Flagsmith({ environmentKey: process.env.FS_SERVER_KEY, enableEvents: true });
if (!existsSync(LEDGER)) writeFileSync(LEDGER, 'run,uid,cache,shown,assigned,exp_label,in_exp,clicked\n');

const u01 = s => createHash('sha256').update(s).digest().readUInt32BE(0) / 2 ** 32;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let errors = 0;

async function visit(i) {
  const uid = `${run}-${VERSION}-${SEED}-${i}`;
  try {
    const r = await fetch(`http://localhost:${PORT}/`, { headers: { cookie: `uid=${uid}` } });
    const html = await r.text();
    const shown = /data-variant="([a-z]+)"/.exec(html)?.[1] ?? 'control';
    const cache = r.headers.get('x-cache-status') ?? 'NONE';
    let assigned, expLabel, inExp;
    if (MODE === 'assignment') {
      const f = await fs.getExperimentFlag(FLAG, uid);          // exposure = assignment
      assigned = f?.value === 'b' ? 'b' : 'control';
      inExp = f?.experiment?.inExperiment ?? 'unknown';
      expLabel = assigned;
    } else {
      const f = (await fs.getIdentityFlags(uid)).getFlag(FLAG); // no exposure
      assigned = f?.value === 'b' ? 'b' : 'control';
      inExp = !!f?.experiment?.inExperiment;
      if (inExp) fs.trackExposureEvent(FLAG, { identifier: uid, value: shown }); // exposure = shown
      expLabel = shown;
    }
    const clicked = u01(`${uid}|${SEED}`) < P[shown];
    if (clicked) fs.trackEvent('headline_click', { identifier: uid });
    appendFileSync(LEDGER, [run, uid, cache, shown, assigned, expLabel, inExp, clicked ? 1 : 0].join(',') + '\n');
  } catch (e) { errors++; if (errors <= 5) console.error(uid, e.message); }
}

const t0 = Date.now(); const jobs = [];
for (let i = 0; i < Number(N); i++) { jobs.push(visit(i)); await sleep(1000 / Number(RPS)); }
await Promise.all(jobs);
await fs.close();
console.log(`${run}: ${N} visits, ${errors} errors, ${((Date.now() - t0) / 1000).toFixed(0)} s → ${LEDGER}`);
