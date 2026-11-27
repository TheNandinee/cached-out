# Cached Out

**Your A/B test can be wrong without a single warning.** A misconfigured cache hands one visitor's page to the next, so people read headline B while Flagsmith logs them under headline A. The split still looks a perfect 50/50. Nothing alerts you.

**▶ Live demo: [https://cached-out.onrender.com/](https://cached-out.onrender.com/)**

Open it, reload twice, then flip the giant switch. (On the free tier the first visit can take about 30 s to wake.)

---

## What we found

- **45–47% of exposures were mislabelled** behind a shared cache, in every seed.
- **The real effect shrank to almost nothing, and in one seed it reversed.** Visitors who actually saw B clicked more (10.1% → 12.9%). Flagsmith was told the opposite and gave B a **37.4%** chance to win. A team would have shipped the worse headline.
- **Sample-ratio checks can't catch it.** The split stayed balanced (oracle SRM p = 0.86, 0.88, 0.69), because the cache doesn't change *who* is assigned, only *what they see*.
- **One extra event catches it.** A `rendered_b` guardrail metric reads **0%** in a healthy experiment and **39.6%** under the bug, right inside Flagsmith.
- **Flagsmith's own SRM value came back `null` on all 16 experiments we checked**, including a deliberate 240/60 split. That's open issue [Flagsmith/flagsmith#9128](https://github.com/Flagsmith/flagsmith/issues/9128): SRM is null when variant weights are 0, which is exactly what the documented setup uses. We added our reproduction to the issue.

This isn't hypothetical. In 2013, a cache that served one version at a time may have affected **7,004 of Upworthy's A/B tests (22%)**, according to the archive authors' 2024 correction in *Scientific Data*. This project uses two real headlines from that archive.

## Try it in 30 seconds

1. **Open the live demo.** The page types out what you were served and what Flagsmith logged about you. About half of visits end in a red **MISLABELLED**, with proof: *"built 3.4 s ago for visitor #a3f1, not you."*
2. **Reload twice.** Your visit history fills up, and Flagsmith's record of you never changes.
3. **Flip the giant switch.** It is the real `cache_bug_on` flag, changed through the Flagsmith Admin API for every visitor. Wait 5 seconds, reload, and everyone is recorded correctly. The switch turns itself back on after 60 seconds so the next person can try it.

Every live visit is logged at `/ledger.csv`. A background visitor loads the page every 2 seconds to stand in for normal traffic; it runs no scripts and is never counted.

## For judges

| Track 1 asks for | Where it is |
|---|---|
| A clear hypothesis | [`EXPERIMENT.md`](EXPERIMENT.md), committed at 13:22 IST before any data, plus five amendments each committed before its own data |
| Versions behind a flag | Multivariate flags, control vs `b`, one per run; `headline_live` on the live site |
| A metric from real events | `headline_click` via `trackEvent`; exposures via `getExperimentFlag` / `trackExposureEvent`; guardrail `rendered_b` |
| Results you can explain | [`RESULTS.md`](RESULTS.md): Flagsmith's numbers next to an independent oracle ([`analysis/oracle.py`](analysis/oracle.py)) |
| Real traffic | The live demo: real browsers, real clicks, every visit public |
| Checkable ground truth | A planted effect, every simulated visitor in [`data/`](data), and Flagsmith's raw API results in [`results/`](results) |
| Replication | Three seeds, all reported, including the runs that missed |

## How a cache rewrites an experimentvisitor A ──► cache MISS ──► app renders headline A for visitor A ──► cache stores it (5 s)
visitor B ──► cache HIT ──► gets visitor A's page (headline A)
Flagsmith logs visitor B under headline B ← the lie
visitor B clicks ──────────► click is credited to headline B, which B never saw
The trigger is ordinary. nginx's default cache key ignores cookies, and the app sends `Cache-Control: public, max-age=5`. On the live site, that header is controlled by a Flagsmith flag, so the bug can be switched on and off.

## The controlled experiment

We used 3,000 simulated visitors per run, at 8 requests per second, with a 50/50 split. The effect is **planted**: a visitor clicks with probability 10% if it *saw* headline A, and 13% if it saw B. That gives us a known true answer to check Flagsmith against. Four cache setups ran side by side:

| Run | Setup | What happened |
|---|---|---|
| r1 | No cache | Recovers the truth: 94.9% chance to win (seed 1), 99.0% (seed 2) |
| **r2** | **Shared cache, ignores cookies** | **Silent and wrong: 45–47% mislabelled, a balanced split, and the effect shrunk or reversed** |
| r3 | Same bug, page logs what was *rendered* | Correct estimate, but the split breaks only by chance (SRM p = 2e-13 in seed 1, 0.44 in seed 2) |
| r4 | r2 minus one config line | The fix: 92.9% (seed 1), 100% (seed 2) |

**The bug (r2), seed by seed:**

| Seed | Exposures mislabelled | Real effect of B | Effect Flagsmith saw | Flagsmith: chance B wins |
|---|---|---|---|---|
| 1 | 47% | +2.2 pts | +0.4 pts | 63.4% |
| 2 | 47% | +2.5 pts | +1.1 pts | 82.9% |
| 3 | 45% | +2.8 pts | **−0.4 pts (reversed)** | **37.4%** |

Flagsmith's exposure and conversion counts matched our per-visitor ledger in every run we checked. The pipeline did its job; it was simply told the wrong thing.

## The fix

**Fix the cache.** In [`edge/nginx.conf`](edge/nginx.conf), r4 is r2 minus one line (`proxy_ignore_headers Cache-Control …`), so the cache respects the app's `Cache-Control: no-store`.

**Add the guardrail, so you'd know.** Fire one event when the treatment is actually on screen, and attach it to the experiment as a second metric:

```js
const flag = flagsmith.getExperimentFlag('my_flag');   // records the exposure
if (renderedVariant === 'b') flagsmith.trackEvent('rendered_b');
```

| | Visitors logged as A who saw B |
|---|---|
| Healthy experiment | **0.0%** (0 of 1,474) |
| With the cache bug | **39.6%** (589 of 1,489) |

Anything above 0% means people are seeing a variant they weren't assigned, whether the cause is a cache, a CDN or a server/client rendering mismatch, and your results can't be trusted.

## Honest limits

- The controlled runs use simulated visitors with a planted effect. That is what makes the true answer checkable. The live demo adds real traffic.
- At 1,500 visitors per arm, a 2–3 point effect sits near the edge of detection. The clean runs crossed 95% in some seeds and not in others, and we report both. So a single "no winner" proves nothing on its own; the evidence is the mislabelling rate plus the shrunken effect.
- Our oracle uses a flat Beta model, and its chance-to-win differs from Flagsmith's by 1–2 points. Every decision uses Flagsmith's own numbers.
- The Upworthy headlines are real, but their archived click-through rates were almost tied (20 vs 21 clicks on about 10,000 impressions each). That's why the effect is planted rather than taken from the archive.

## Pre-registration trail

| Commit | What it locked in, before the data |
|---|---|
| `51dae44` | Hypothesis, runs, sample size, predictions, decision rules |
| `970df07` | Amendment 1: report Flagsmith's SRM as returned, plus our own chi-square |
| `dddd24c` | Amendment 2: one replication (seed 2), reported whatever it showed |
| `f60d5e6` | Amendment 3: the `rendered_b` guardrail demo |
| `bdb518e` | Amendment 4: the live real-visitor site |

## Run it yourself

You need Docker, Node 20+, Python 3 with numpy and pandas, and Flagsmith CLI v2 logged in to an environment with Experimentation.

```bash
cp .env.example .env                                   # add your client-side and server-side keys
npm install
python3 analysis/pick_upworthy.py data/upworthy.csv    # Upworthy exploratory CSV from OSF (jd64p)
./scripts/full_run.sh v1 20261127                      # flags, experiments, 4 × 3,000 visitors, results
python3 analysis/oracle.py v1                          # independent recalculation
```

To run the live site locally:
```bash
docker build -f live/Dockerfile -t cached-out-live . && docker run --rm -p 8090:8080 --env-file .env cached-out-live
```

## How Flagsmith is used

- **Multivariate flags** with keyed variations, one per run, plus `headline_live` on the live site.
- **Experimentation:** a conversion metric plus a guardrail metric, Bayesian results via the results API, and the managed warehouse.
- **A boolean flag as a live kill switch**, `cache_bug_on`, flipped from the page through the **Admin API**.
- **JS SDK** in the page: `getExperimentFlag`, `trackExposureEvent`, `trackEvent`, `flushEvents`.
- **Node.js SDK** on the server (evaluation with no exposure) and in the traffic bot.
- **Flagsmith CLI v2** (`flagsmith api`) for every flag, metric, experiment and results call.

## Repository map

| Path | What's there |
|---|---|
| `live/` | The public demo: page, server, cache config, the switch |
| `app/`, `edge/` | The controlled experiment app and its four cache setups |
| `bot/` | Simulated visitors, the SRM probe |
| `analysis/` | Headline pick, oracle |
| `scripts/` | Setup and full runs |
| `data/` | Per-visitor ledgers |
| `results/` | Raw Flagsmith results |

## Credits

Headlines come from the Upworthy Research Archive (J. Nathan Matias, Kevin Munger, Marianne Aubin Le Quere, Charles Ebersole), CC BY 4.0. The raw archive CSV is not redistributed here; download it from OSF (jd64p).

Built for **Toggle Wars**, Track 1, on Flagsmith Experimentation. Code under the MIT license.
