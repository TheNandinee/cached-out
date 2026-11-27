#!/usr/bin/env python3
"""Seeded pick of one clean (outside 2013-06-25..2014-01-10) 2-headline Upworthy test."""
import json, random, sys
import pandas as pd

SEED = 20261127
df = pd.read_csv(sys.argv[1] if len(sys.argv) > 1 else "data/upworthy.csv")
df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce")
bad = (df.created_at >= "2013-06-25") & (df.created_at <= "2014-01-10")
df = df[~bad].dropna(subset=["headline", "created_at"])

cands = []
for tid, t in df.groupby("clickability_test_id"):
    t = t.drop_duplicates("headline").sort_values("impressions", ascending=False)
    if len(t) >= 2 and t.impressions.iloc[1] > 2000:
        cands.append((tid, t.iloc[:2]))
cands.sort(key=lambda x: -x[1].impressions.sum())
tid, pair = random.Random(SEED).choice(cands[:50])
pair = pair.assign(ctr=pair.clicks / pair.impressions).sort_values("ctr")
loser, winner = pair.iloc[0], pair.iloc[1]
out = {
    "source": f"Upworthy Research Archive (CC BY 4.0), test {tid}, created {loser.created_at.date()}",
    "control": loser.headline,
    "b": winner.headline,
    "archived": {"control": {"impressions": int(loser.impressions), "clicks": int(loser.clicks)},
                 "b": {"impressions": int(winner.impressions), "clicks": int(winner.clicks)}},
}
open("app/headlines.json", "w").write(json.dumps(out, indent=2))
print(f"{len(cands)} eligible clean tests; picked {tid}")
print(json.dumps(out, indent=2))
