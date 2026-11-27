// Finds two visitors Flagsmith ASSIGNED to different headlines who were SHOWN the same cached page (port 8082).
import * as fsmod from '@flagsmith/nodejs';
const Flagsmith = fsmod.Flagsmith ?? fsmod.default;
const fs = new Flagsmith({ environmentKey: process.env.FS_SERVER_KEY });
const FLAG = `headline_r2_${process.env.FLAG_VERSION}`;
const shown = async uid => /data-variant="([a-z]+)"/.exec(await (await fetch('http://localhost:8082/', { headers: { cookie: `uid=${uid}` } })).text())[1];
const assigned = async uid => ((await fs.getIdentityFlags(uid)).getFlag(FLAG).value === 'b' ? 'b' : 'control');
for (let i = 0; i < 50; i++) {
  const a = `demo-${Date.now()}-a`, b = `demo-${Date.now()}-b`;
  const [sa, sb] = [await shown(a), await shown(b)];
  const [aa, ab] = [await assigned(a), await assigned(b)];
  if (aa !== ab && sa === sb) {
    console.log(`\n  Visitor ${a}\n    Flagsmith assigned: ${aa.padEnd(8)} | cache showed: ${sa}`);
    console.log(`  Visitor ${b}\n    Flagsmith assigned: ${ab.padEnd(8)} | cache showed: ${sb}`);
    console.log(`\n  → Two visitors, two different assignments, one cached page. One of them is mislabelled.\n`);
    process.exit(0);
  }
}
console.log('no pair found in 50 tries — run again');
