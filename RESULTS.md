# Results — Cached Out

All numbers below come from committed files: `data/ledger_v*.csv` (what each simulated visitor saw and did),
`results/*_v*.json` (Flagsmith's own results API) and `analysis/oracle.py` (independent recalculation).
Pre-registration and all amendments: `EXPERIMENT.md` (commit history shows each was written before its data).

## 1. Flagsmith counted exactly what it was sent
In every run, Flagsmith's exposures and conversions per arm match the ledger exactly (e.g. v1 r1:
control 1567 / 159, B 1433 / 175). The pipeline is not the problem. What it is *told* is.

## 2. Main result: a shared cache silently corrupts the experiment
Planted truth: visitors who SEE headline B click more. Flagsmith's `chance_to_win`, read with the pre-registered
95% rule:

| Run | Setup | v1 (seed 20261127) | v2 (seed 20261128) |
|---|---|---|---|
| r1 | no cache | 94.9% — no clear winner (by 0.1) | **99.0% — winner** |
| r2 | **shared cache ignoring cookies (the bug)** | **63.4% — no winner** | **82.9% — no winner** |
| r3 | same bug, page logs the *rendered* variant | **98.6% — winner** | **95.1% — winner** |
| r4 | the one-line fix (respect `no-store`) | 92.9% — no clear winner | **100.0% — winner** |

**r2, consistent across both seeds:** 92–93% cache hits, **47% of exposures carry the wrong label**, and the
real effect shrinks — what visitors actually did vs what Flagsmith was told:
- v1: +2.2 pp real (11.0% → 13.2%) → **+0.4 pp** in Flagsmith (12.0% → 12.4%)
- v2: +2.5 pp real (9.6% → 12.1%) → **+1.1 pp** in Flagsmith (10.4% → 11.5%)

The split stays perfectly balanced (oracle SRM p = 0.86 and 0.88), so **no sample-ratio-mismatch check of any
kind can detect this bug**.

**Honest caveats.**
- At 1,500 visitors per arm the clean runs sit near the edge of detectability: r1 and r4 cleared 95% in v2 but
  not in v1. So r2's "no winner" alone proves nothing; the evidence is the 47% mislabelling and the shrunken lift.
- r3 v2 shows 95.1% chance-to-win while its 95% interval still crosses zero (−3.8% to +45.3%). Not a contradiction:
  chance-to-win is one-sided, the interval two-sided.
- The oracle's flat Beta model gives chance-to-win 1–2 points away from Flagsmith's (e.g. 96.4% vs 94.9%), as
  expected from a different model of the same counts. We report Flagsmith's numbers for every decision.

## 3. Where you log the exposure decides whether the bug is silent or loud
- **Log the assignment** (`getExperimentFlag`, r2): balanced split, wrong labels → silent and wrong.
- **Log what was rendered** (`trackExposureEvent` with the shown value, r3): correct labels, but which headline
  each cache window serves is a coin flip, so the split *may* break. It did in v1 (1299/1701, oracle SRM
  p = 2.1e-13) and did not in v2 (1479/1521, p = 0.44). Correct estimate, unreliable alarm.

## 4. The fix: a one-event guardrail inside Flagsmith (v3)
Fire `rendered_b` whenever headline B is actually on screen and attach it as a second metric. A healthy
experiment must read 0% in control and 100% in B.

| v3 (seed 20261129) | rendered_b, control | rendered_b, B |
|---|---|---|
| r1 healthy | **0.0%** (0/1474) | **100.0%** (1526/1526) |
| r2 cache bug | **39.6%** (589/1489) | 50.6% (764/1511) |

Pre-registered expectation for r2 control was 45–50%; it came in at 39.6% because this run's cache served B to
45% of visitors (0.90 hit rate × 45% ≈ 40.5%). The detection itself is unambiguous: 0% vs 39.6%.

**In v3 the bug flipped the sign.** Visitors who actually saw B clicked more (10.1% → 12.9%), but Flagsmith was told the opposite (11.6% → 11.2%) and reported B's chance to win as 37.4% (lift -3.2%). Without the guardrail, a team would have dropped the better headline.


## 5. Flagsmith's SRM value
`results.payload.srm_p_value` was `null` on all 13 experiments we ran on Flagsmith Cloud (Experimentation beta),
including deliberate 240/60 probes created via API (#1133) and via the dashboard (#1134), and a 1299/1701 split
at n = 3,000 (#1138). We report this as observed; we have asked the Flagsmith team whether SRM is enabled yet.

## Data credit
Headlines: Upworthy Research Archive (Matias, Munger, Aubin Le Quere, Ebersole), CC BY 4.0,
test 540f9a2faff5cda1c4000008. The archived pair was nearly tied (20 vs 21 clicks on ~10k impressions each),
which is why the effect here is planted rather than taken from the archive.
--- appendix: oracle tables

### Oracle, v1

| run | n | cache hit | label≠seen | TRUE ctrl→B (by seen) | Flagsmith-view ctrl→B (by label) | P(B>ctrl) oracle | SRM p oracle | Flagsmith exposures ctrl/B | Flagsmith srm_p_value |
|---|---|---|---|---|---|---|---|---|---|
| r1 | 3000 | 0% | 0% | 10.1% → 12.2% | 10.1% → 12.2% | 96.4% | 0.014 | 1567/1433 | None |
| r2 | 3000 | 93% | 47% | 11.0% → 13.2% | 12.0% → 12.4% | 63.6% | 0.86 | 1505/1495 | None |
| r3 | 3000 | 97% | 0% | 10.5% → 13.6% | 10.5% → 13.6% | 99.4% | 2.1e-13 | 1299/1701 | None |
| r4 | 3000 | 0% | 0% | 10.5% → 12.4% | 10.5% → 12.4% | 94.5% | 0.51 | 1482/1518 | None |

Click-hash check (r1): control 10.1% (planted 10%), B 12.2% (planted 13%)

### Oracle, v2

| run | n | cache hit | label≠seen | TRUE ctrl→B (by seen) | Flagsmith-view ctrl→B (by label) | P(B>ctrl) oracle | SRM p oracle | Flagsmith exposures ctrl/B | Flagsmith srm_p_value |
|---|---|---|---|---|---|---|---|---|---|
| r1 | 3000 | 0% | 0% | 10.8% → 14.0% | 10.8% → 14.0% | 99.6% | 0.51 | 1518/1482 | None |
| r2 | 3000 | 92% | 47% | 9.6% → 12.1% | 10.4% → 11.5% | 84.2% | 0.88 | 1496/1504 | None |
| r3 | 3000 | 97% | 0% | 10.1% → 12.2% | 10.1% → 12.2% | 96.5% | 0.44 | 1479/1521 | None |
| r4 | 3000 | 0% | 0% | 9.6% → 14.5% | 9.6% → 14.5% | 100.0% | 0.51 | 1518/1482 | None |

Click-hash check (r1): control 10.8% (planted 10%), B 14.0% (planted 13%)

### Oracle, v3

| run | n | cache hit | label≠seen | TRUE ctrl→B (by seen) | Flagsmith-view ctrl→B (by label) | P(B>ctrl) oracle | SRM p oracle | Flagsmith exposures ctrl/B | Flagsmith srm_p_value |
|---|---|---|---|---|---|---|---|---|---|
| r1 | 3000 | 0% | 0% | 10.6% → 13.3% | 10.6% → 13.3% | 98.9% | 0.34 | 1474/1526 | None |
| r2 | 3000 | 90% | 45% | 10.1% → 12.9% | 11.6% → 11.2% | 37.6% | 0.69 | 1489/1511 | None |

Click-hash check (r1): control 10.6% (planted 10%), B 13.3% (planted 13%)
