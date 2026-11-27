#!/usr/bin/env python3
"""Builds the README figures from the committed ledgers and Flagsmith results."""
import csv, json
BG, AMBER, AMBER2, DIM, LINE, RED, GREEN, CYAN = "#0A0805", "#FFB43A", "#FFD28A", "#9B7A3E", "#3B2D15", "#FF4B3E", "#86E58F", "#59E6F2"
MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"

def rate(rows, key, v):
    s = [r for r in rows if r[key] == v]
    return sum(r["clicked"] == "1" for r in s) / len(s) if s else 0

def r2(version):
    rows = [r for r in csv.DictReader(open(f"data/ledger_{version}.csv")) if r["run"] == "r2"]
    real = 100 * (rate(rows, "shown", "b") - rate(rows, "shown", "control"))
    saw = 100 * (rate(rows, "exp_label", "b") - rate(rows, "exp_label", "control"))
    mis = 100 * sum(r["shown"] != r["exp_label"] for r in rows) / len(rows)
    return real, saw, mis

def frame(w, h, body):
    scan = "".join(f'<rect x="0" y="{y}" width="{w}" height="1" fill="#000" opacity=".22"/>' for y in range(0, h, 3))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" font-family="{MONO}">'
            f'<rect width="{w}" height="{h}" fill="{BG}"/>{body}{scan}</svg>')

# 1) hero
hero = frame(1200, 430, f'''
<circle cx="34" cy="30" r="7" fill="{RED}"/><circle cx="56" cy="30" r="7" fill="{AMBER}"/><circle cx="78" cy="30" r="7" fill="{GREEN}"/>
<text x="102" y="35" fill="{DIM}" font-size="15">cached-out — live experiment on flagsmith</text>
<line x1="0" y1="56" x2="1200" y2="56" stroke="{LINE}"/>
<text x="48" y="112" fill="{DIM}" font-size="20">$ curl -s cached-out/ <tspan fill="{DIM}">#</tspan> the page you were served</text>
<text x="72" y="146" fill="{AMBER2}" font-size="22">served: headline B · built 3.4 s ago for visitor #a3f1 — <tspan fill="{RED}" font-weight="700">not you</tspan></text>
<text x="48" y="196" fill="{DIM}" font-size="20">$ flagsmith.getExperimentFlag('headline_live')</text>
<text x="72" y="230" fill="{CYAN}" font-size="22">logged: headline A · identity #9c2e (you)</text>
<text x="48" y="280" fill="{DIM}" font-size="20">$ diff served logged</text>
<text x="72" y="312" fill="{RED}" font-size="22">- served: headline B</text><text x="72" y="342" fill="{CYAN}" font-size="22">+ logged: headline A</text>
<text x="672" y="304" fill="{CYAN}" font-size="74" font-weight="700" opacity=".35" transform="translate(-3,0)" textLength="470" lengthAdjust="spacingAndGlyphs">MISLABELLED</text><text x="672" y="304" fill="{RED}" font-size="74" font-weight="700" opacity=".45" transform="translate(3,0)" textLength="470" lengthAdjust="spacingAndGlyphs">MISLABELLED</text>
<text x="672" y="304" fill="{RED}" font-size="74" font-weight="700" textLength="470" lengthAdjust="spacingAndGlyphs">MISLABELLED</text>
<text x="48" y="400" fill="{AMBER}" font-size="19">A live Flagsmith A/B test behind a misconfigured cache. The split looks 50/50. The data is wrong.</text>''')
open("docs/banner.svg", "w").write(hero)

# 2) how the bug happens
def box(x, y, w, h, title, sub, color):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" stroke="{color}" stroke-width="2"/>'
            f'<text x="{x+16}" y="{y+32}" fill="{color}" font-size="19" font-weight="700">{title}</text>'
            f'<text x="{x+16}" y="{y+58}" fill="{DIM}" font-size="14">{sub}</text>')
def arrow(x1, y1, x2, y2, color, label=""):
    t = f'<text x="{(x1+x2)/2}" y="{min(y1,y2)-10}" fill="{color}" font-size="13" text-anchor="middle">{label}</text>' if label else ""
    return (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="2" marker-end="url(#a)"/>' + t)
how = frame(1200, 420, f'''
<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="{AMBER}"/></marker></defs>
<text x="40" y="44" fill="{AMBER2}" font-size="22"># how a cache rewrites an experiment</text>
{box(40, 80, 230, 80, "visitor A", "assigned: headline A", AMBER)}
{box(480, 80, 240, 80, "cache (5 s)", "key ignores cookies", AMBER)}
{box(930, 80, 230, 80, "app", "renders A for visitor A", AMBER)}
{arrow(270, 120, 478, 120, AMBER, "miss")}{arrow(720, 120, 928, 120, AMBER, "")}
{box(40, 240, 230, 80, "visitor B", "assigned: headline B", CYAN)}
{arrow(270, 280, 478, 175, RED, "hit: gets A's page")}
{box(930, 240, 230, 80, "flagsmith", "logs B under headline B", CYAN)}
{arrow(270, 300, 928, 300, CYAN, "exposure + click credited to B")}
<text x="40" y="380" fill="{RED}" font-size="18">visitor B read headline A. Flagsmith counted the click for headline B. The split stays 50/50, so nothing alerts you.</text>''')
open("docs/how.svg", "w").write(how)

# 3) real effect vs what Flagsmith saw, per seed (from the ledgers)
vals = [r2(v) for v in ("v1", "v2", "v3")]
x0, y0, scale = 140, 300, 60  # y0 = zero line; 60 px per point
bars = ""
for i, (real, saw, mis) in enumerate(vals):
    gx = x0 + i * 330
    for j, (val, col, lab) in enumerate(((real, GREEN, "real effect"), (saw, RED, "what flagsmith saw"))):
        bx, h = gx + j * 110, val * scale
        y = y0 - h if h >= 0 else y0
        bars += f'<rect x="{bx}" y="{y:.1f}" width="90" height="{abs(h):.1f}" fill="{col}" opacity=".9"/>'
        ty = (y - 10) if h >= 0 else (y0 + abs(h) + 24)
        bars += f'<text x="{bx+45}" y="{ty:.1f}" fill="{col}" font-size="20" text-anchor="middle" font-weight="700">{val:+.1f}</text>'
    bars += f'<text x="{gx+100}" y="{y0+80}" fill="{AMBER}" font-size="17" text-anchor="middle">seed {i+1} · {mis:.0f}% mislabelled</text>'
effect = frame(1200, 430, f'''
<text x="40" y="44" fill="{AMBER2}" font-size="22"># effect of headline B, in percentage points</text>
<rect x="760" y="26" width="16" height="16" fill="{GREEN}"/><text x="784" y="40" fill="{DIM}" font-size="15">what visitors actually did</text>
<rect x="760" y="52" width="16" height="16" fill="{RED}"/><text x="784" y="66" fill="{DIM}" font-size="15">what flagsmith was told</text>
<line x1="110" y1="{y0}" x2="1140" y2="{y0}" stroke="{DIM}" stroke-dasharray="4 4"/><text x="100" y="{y0+5}" fill="{DIM}" font-size="14" text-anchor="end">0</text>
{bars}
<text x="1000" y="{y0+40}" fill="{RED}" font-size="16" text-anchor="middle">← reversed</text>''')
open("docs/effect.svg", "w").write(effect)

# 4) guardrail (from Flagsmith's own results)
def guard(path):
    m = json.load(open(path))["results"]["payload"]["metrics"][1]["variants"]["control"]
    return 100 * m["sum"] / m["n"], int(m["sum"]), m["n"]
ok, okn, okd = guard("results/r1_v3.json"); bad, badn, badd = guard("results/r2_v3.json")
W = 860
gr = frame(1200, 300, f'''
<text x="40" y="44" fill="{AMBER2}" font-size="22"># the guardrail: visitors logged as A who were shown B</text>
<text x="40" y="110" fill="{AMBER}" font-size="18">healthy experiment</text>
<rect x="280" y="88" width="{W}" height="32" fill="{LINE}"/><rect x="280" y="88" width="{max(4, W*ok/100):.1f}" height="32" fill="{GREEN}"/>
<text x="1150" y="112" fill="{GREEN}" font-size="24" text-anchor="end" font-weight="700">{ok:.1f}%</text>
<text x="40" y="190" fill="{AMBER}" font-size="18">with the cache bug</text>
<rect x="280" y="168" width="{W}" height="32" fill="{LINE}"/><rect x="280" y="168" width="{W*bad/100:.1f}" height="32" fill="{RED}"/>
<text x="1150" y="192" fill="{RED}" font-size="24" text-anchor="end" font-weight="700">{bad:.1f}%</text>
<text x="40" y="262" fill="{DIM}" font-size="15">measured inside flagsmith: {okn} of {okd} vs {badn} of {badd} control-arm visitors. one extra event: trackEvent('rendered_b').</text>''')
open("docs/guardrail.svg", "w").write(gr)
print("figures:", ", ".join(f"{v[0]:+.1f}/{v[1]:+.1f}" for v in vals), f"| guardrail {ok:.1f}% vs {bad:.1f}%")
