// usage: node bot/srm_probe.js <flag>  — 240 exposures labelled control, 60 labelled b, 10% convert
import * as fsmod from '@flagsmith/nodejs';
const Flagsmith = fsmod.Flagsmith ?? fsmod.default;
const FLAG = process.argv[2];
const fs = new Flagsmith({ environmentKey: process.env.FS_SERVER_KEY, enableEvents: true });
let sent = { control: 0, b: 0 }, skipped = 0;
for (let i = 0; i < 300; i++) {
  const uid = `${FLAG}-${i}`;
  const label = i < 240 ? 'control' : 'b';
  const f = (await fs.getIdentityFlags(uid)).getFlag(FLAG);
  if (!f?.experiment?.inExperiment) { skipped++; continue; }
  fs.trackExposureEvent(FLAG, { identifier: uid, value: label }); sent[label]++;
  if (i % 10 === 0) fs.trackEvent('headline_click', { identifier: uid });
}
await fs.close();
console.log(FLAG, 'sent', sent, 'skipped (not in experiment)', skipped);
