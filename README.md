# Cached Out — would your A/B test survive your CDN?

One Flagsmith experiment, run on the same page behind four cache configurations, with a planted, known effect.

**Result:** a common cache misconfiguration (a shared cache that ignores the user cookie) mislabelled **45–47%
of exposures** in every run. It shrank a real effect to almost nothing in two seeds and **reversed it** in the
third, while the split stayed perfectly balanced, so **no sample-ratio check can catch it**. A one-event
guardrail metric inside Flagsmith catches it immediately: **0% vs 39.6%**.

Real-world anchor: the Upworthy Research Archive authors reported (Scientific Data, 2024 correction) that a web
cache serving one arm at a time may have affected 7,004 of their A/B tests (22%) in 2013.

## For judges
| Track 01 asks for | Where it is |
|---|---|
| A clear hypothesis | `EXPERIMENT.md`, committed 13:22 IST before any data; 3 amendments, each committed before its data |
| Versions behind a flag | Multivariate flags `headline_r{1..4}_v{1,2,3}` (control / `b`), evaluated in `app/server.js` |
| A metric from real events | `headline_click` via `trackEvent`; exposures via `getExperimentFlag` / `trackExposureEvent`; guardrail `rendered_b` |
| Results you can explain | `RESULTS.md`: Flagsmith's own numbers next to an independent oracle (`analysis/oracle.py`) |
| Checkable ground truth | Planted click rates; every simulated visitor's view and click in `data/ledger_v*.csv`; Flagsmith's raw results in `results/` |
| Replication | Three seeds (v1, v2, v3), all reported in full |

## The four runs
| Run | Port | Cache | Exposure logged as | Outcome |
|---|---|---|---|---|
| r1 | 8081 | none | assignment | Recovers the truth (winner in 2 of 3 seeds at this sample size) |
| r2 | 8082 | shared, ignores cookie, 1 s | assignment | **Silent and wrong:** 45–47% mislabelled, balanced split, effect shrunk or reversed |
| r3 | 8083 | shared, ignores cookie, 10 s | rendered variant | Right estimate; the split breaks only by chance (p = 2e-13 in v1, 0.44 in v2) |
| r4 | 8084 | r2 minus one line | assignment | The fix: recovers the truth |

The fix is literally one line: remove `proxy_ignore_headers Cache-Control …` in `edge/nginx.conf`, so the
cache respects the app's `Cache-Control: no-store`.

## Add the guardrail to your own experiment
Fire one event when the treatment is actually on screen, and attach it as a second metric:

```js
const flag = flagsmith.getExperimentFlag('my_flag');   // records the exposure
if (renderedVariant === 'b') flagsmith.trackEvent('rendered_b');
```

A healthy experiment reads **0% in control and 100% in B**. Anything in between means users are seeing a
variant they weren't assigned (a cache, a CDN, an SSR/hydration mismatch), and the results can't be trusted.

## Run it yourself
Needs Docker, Node 20+, Python 3 with numpy and pandas, and Flagsmith CLI v2 logged in to an environment with
Experimentation.
```bash
cp .env.example .env        # add your client-side and server-side keys
npm install
python3 analysis/pick_upworthy.py data/upworthy.csv   # needs the Upworthy exploratory CSV from OSF (jd64p)
./scripts/create_flags.sh v1 && ./scripts/full_run.sh v1 20261127
python3 analysis/oracle.py v1
```

## How Flagsmith is used
- Multivariate flags with keyed variations; one experiment per run, 50/50, 100% rollout
- Experimentation: two metrics (conversion + guardrail), Bayesian results via the results API
- JS SDK in the page: `getExperimentFlag`, `trackExposureEvent`, `trackEvent`, `flushEvents`
- Node.js SDK in the server (`getIdentityFlags`, no exposure) and the traffic bot
- Flagsmith CLI v2 (`flagsmith api`) for every flag, metric, experiment and results call

## Files
`app/` page and server · `edge/nginx.conf` the four caches · `bot/` simulated visitors and the SRM probe ·
`analysis/` headline pick and oracle · `scripts/` setup and runs · `data/` ledgers · `results/` raw Flagsmith results

## Credits
Headlines: Upworthy Research Archive (J. Nathan Matias, Kevin Munger, Marianne Aubin Le Quere, Charles Ebersole),
CC BY 4.0. The raw archive CSV is not redistributed here; download it from OSF (jd64p).
