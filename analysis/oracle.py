#!/usr/bin/env python3
"""Recompute from the ledger what really happened and what Flagsmith should report; compare with Flagsmith."""
import csv, json, math, os, sys
from collections import defaultdict
import numpy as np

V = sys.argv[1] if len(sys.argv) > 1 else "v1"
rows = list(csv.DictReader(open(f"data/ledger_{V}.csv")))
by = defaultdict(list)
for r in rows: by[r["run"]].append(r)

def rate(R, key, v):
    S = [r for r in R if r[key] == v]; c = sum(r["clicked"] == "1" for r in S); return c, len(S)
def p_beat(cb, nb, ca, na, draws=400_000, seed=7):
    g = np.random.default_rng(seed)
    return float((g.beta(1 + cb, 1 + nb - cb, draws) > g.beta(1 + ca, 1 + na - ca, draws)).mean())
def srm_p(na, nb):
    e = (na + nb) / 2; x = ((na - e) ** 2 + (nb - e) ** 2) / e; return math.erfc(math.sqrt(x / 2))
pct = lambda c, n: f"{100*c/n:.1f}%" if n else "–"

print(f"| run | n | cache hit | label≠seen | TRUE ctrl→B (by seen) | Flagsmith-view ctrl→B (by label) | "
      f"P(B>ctrl) oracle | SRM p oracle | Flagsmith exposures ctrl/B | Flagsmith srm_p_value |")
print("|" + "---|" * 10)
for run, R in sorted(by.items()):
    n = len(R); hit = sum(r["cache"] == "HIT" for r in R) / n
    mis = sum(r["shown"] != r["exp_label"] for r in R) / n
    tA, tB = rate(R, "shown", "control"), rate(R, "shown", "b")
    fA, fB = rate(R, "exp_label", "control"), rate(R, "exp_label", "b")
    fs_exp, fs_srm = "–", "–"
    path = f"results/{run}_{V}.json"
    if os.path.exists(path):
        p = json.load(open(path))["results"]["payload"]; v = p["metrics"][0]["variants"]
        fs_exp = f"{v['control']['n']}/{v['b']['n']}"; fs_srm = p.get("srm_p_value")
    print(f"| {run} | {n} | {hit:.0%} | {mis:.0%} | {pct(*tA)} → {pct(*tB)} | {pct(*fA)} → {pct(*fB)} | "
          f"{p_beat(fB[0], fB[1], fA[0], fA[1]):.1%} | {srm_p(fA[1], fB[1]):.2g} | {fs_exp} | {fs_srm} |")

# fairness check on the click hash: among r1 visitors, observed vs planted rates
R1 = by.get("r1", [])
if R1:
    a, b = rate(R1, "shown", "control"), rate(R1, "shown", "b")
    print(f"\nClick-hash check (r1): control {pct(*a)} (planted 10%), B {pct(*b)} (planted 13%)")
