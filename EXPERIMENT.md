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

## Amendment 3 — committed after v2, before any v3 data

Not a replication of the effect. A detection demo: we add a guardrail metric `rendered_b` (fired when headline B
is actually displayed) to show that the label/display mismatch in r2 — invisible to SRM — is measurable inside
Flagsmith. Runs: r1 (healthy) and r2 (bug), v3, seed 20261129, 3,000 visitors each. Prediction: rendered_b ≈ 0%
in control and ≈ 100% in B for r1; ≈ 45–50% in control and ≈ 50–55% in B for r2. Reported in full whatever it shows.

## Amendment 4 — committed before any live data

Live, real-visitor version at a public URL. Same headlines. nginx with its default cache key (ignores cookies)
sits in front of the app. A boolean Flagsmith flag `cache_bug_on` controls the app's Cache-Control header:
ON → `public, max-age=5` (cacheable, the misconfiguration); OFF → `private, no-store`. Each page view compares
the variant Flagsmith assigned to the visitor (`getExperimentFlag`) with the variant actually rendered, shows
the visitor the result, and logs it. A background process requests the page every 2 s using a fixed pool of
20 identities, standing in for ordinary site traffic so that the cache is warm (it runs no JavaScript and
records no exposures). Experiment `headline_live`: 50/50, 100% rollout, metrics `headline_click` and the
guardrail `rendered_b`.
Prediction: while ON, 35–55% of real page views are mislabelled; while OFF, 0%. Reported in full whatever the
number of visitors.

## Amendment 5: visitors can flip the bug flag

The live page gains a button that flips `cache_bug_on` through the Flagsmith Admin API, for every visitor. After
being turned off it is turned back on automatically after 60 s; flips are limited to one per 5 s. Each logged visit
already records the flag state at the time, so the ON/OFF comparison in Amendment 4 is unchanged.
