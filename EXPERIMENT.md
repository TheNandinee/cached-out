# Cached Out — pre-registration (committed before any data)

**Question.** Does a misconfigured shared cache in front of a server-rendered page break a Flagsmith
experiment, and does Flagsmith's sample-ratio-mismatch (SRM) check notice?

**Real-world anchor.** The Upworthy Research Archive authors (Scientific Data correction, 2024) report that
a web cache serving one arm at a time may have affected 7,004 tests (22%) between 2013-06-25 and 2014-01-10.

**Product hypothesis (every run).** Headline B (archived winner) gets more `headline_click` than control (archived loser).

**Ground truth (planted).** Each simulated visitor clicks with p = 0.10 if it SAW control and p = 0.13 if it SAW B.
The click is a deterministic hash of (uid, seed), so the outcome is reproducible.

**Runs.** r1 no cache · r2 shared cache, 1 s TTL, logs assignment · r3 shared cache, 10 s TTL, logs rendered
variant · r4 r2 with the fix (cache respects `Cache-Control: no-store`). 3,000 visitors per run at 8 req/s,
seed 20261127, 50/50 split, 100% rollout. Flagsmith Cloud, managed warehouse.

**Predictions.**
- r1, r4: chance-to-beat for B > 95%; observed lift near +3 pp.
- r2: observed lift ≈ (1 − cache hit rate) × 3 pp; Flagsmith reports no clear winner; SRM silent.
- r3: SRM warning fires; per-arm CTRs near 10% / 13%.

**Decision rules.** A winner needs chance-to-beat ≥ 95% (Flagsmith's threshold). Anything below that is reported
as "no clear winner". SRM is reported as fired or not fired at Flagsmith's own threshold. Smoke-test experiments
(FLAG_VERSION=v0) are discarded; reported results use v1 only.

## Amendment 1 — committed after smoke test (v0), before any v1 data

Smoke-test probes found Flagsmith's `srm_p_value` returned `null` on three experiments with severe imbalance
(240/60 API-created #1133, 240/60 dashboard-created #1134, 169/31 #1122), all on a configured 50/50 split.
Change to reporting only: for every v1 run we report (a) Flagsmith's `srm_p_value` exactly as returned,
including `null`, and (b) our own chi-square SRM p-value computed from Flagsmith's exposure counts
(analysis/oracle.py), with p < 0.001 as the threshold. Hypotheses, runs, sample sizes and decision rules are unchanged.

## Amendment 2 — committed after v1, before any v2 data

Decided after seeing v1 (r4 reached 94.5%, just under the 95% rule). v1 remains the primary result and is
reported unchanged. We add one full replication of all four runs (v2, seed 20261128, 3,000 visitors each,
same code) and report it in full alongside v1, whatever it shows. No further replications will be run.
