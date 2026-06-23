"""Live-feed anomaly detection demo over the oTENTik availability data.

Answers: "feed live data and see if the agent picks up on anomalies."

It mirrors the NeMo Agent Toolkit's **alert_triage_agent** pattern: a cheap,
deterministic DETECTOR turns a stream of events into candidate alerts, and an
AGENT then TRIAGES each alert (gathers context via SQL, classifies it, explains
it, recommends an action). Detection should be deterministic and always-on;
the LLM is spent only on the few events that look anomalous.

Pipeline:
    replay snapshots (one date = one "tick")            <- the live feed
      -> rolling robust-baseline + data-quality detector  <- flags candidates
      -> triage agent (SQL context + verdict)             <- "picks up on it"
      -> out/anomaly_report.html                          <- visualize + learn

No LLM key needed: triage uses a deterministic explainer by default; if you set
a real LangChain chat model it will generate the narrative instead. Inject a
known anomaly with --inject to prove the agent catches it.

Run:
    cd nemo-sql-agent
    PYTHONPATH=src python anomaly/anomaly_demo.py --inject
    # open anomaly/out/anomaly_report.html
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import statistics
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
DB = str(ROOT / "data" / "otentiks.db")
OUT = Path(__file__).resolve().parent / "out"

WINDOW = 21          # rolling baseline window (days)
MIN_HISTORY = 7      # need this many prior points before judging
Z_SPIKE = 3.0        # robust z-score threshold
ABS_MARGIN = 5       # also require >= this many units above baseline (kills noise)
CHURN_WINDOW = 14
CHURN_FLIPS = 6      # status flips within window => "flapping"


# ----------------------------- the live feed ----------------------------- #
def load_series(db_path: str = DB):
    """Return system + per-park-group daily available-count series, time-ordered."""
    c = sqlite3.connect(db_path)
    dates = [r[0] for r in c.execute("SELECT DISTINCT date FROM availability ORDER BY date")]
    system = {d: 0 for d in dates}
    groups: dict[str, dict[str, int]] = {}
    rows = c.execute("""
        SELECT p.park_group, a.date, SUM(a.is_available)
        FROM availability a
        JOIN otentiks o ON a.resource_id = o.resource_id
        JOIN parks p ON o.park_id = p.park_id
        GROUP BY p.park_group, a.date
    """).fetchall()
    for g, d, v in rows:
        groups.setdefault(g, {dd: 0 for dd in dates})[d] = v
        system[d] += v
    c.close()
    return dates, system, groups


def inject_anomaly(dates, system, groups):
    """Inject a clear synthetic 'cancellation wave' so detection is verifiable."""
    target_date = dates[len(dates) // 2 + 5]          # mid-stream
    g = "Fundy National Park"
    bump = 22                                         # far above Fundy's natural max (~9)
    groups[g][target_date] += bump
    system[target_date] += bump
    return {"date": target_date, "group": g, "added": bump}


# ----------------------------- the detector ------------------------------ #
@dataclass
class Alert:
    date: str
    scope: str          # "system" or a park group
    kind: str           # spike | dropout | standing | flapping
    value: float
    baseline: float
    z: float
    detail: str = ""
    triage: dict = field(default_factory=dict)


def _robust(window: list[float]):
    med = statistics.median(window)
    mad = statistics.median([abs(x - med) for x in window]) or 0.0
    sigma = max(1.0, 1.4826 * mad)                    # floor avoids div-by-tiny
    return med, sigma


def detect(dates, system, groups) -> list[Alert]:
    alerts: list[Alert] = []
    series = {"system": system, **groups}
    for scope, smap in series.items():
        seq = [smap[d] for d in dates]
        # standing anomaly: never available across the whole window
        if scope != "system" and max(seq) == 0:
            alerts.append(Alert(dates[0], scope, "standing", 0, 0, 0.0,
                                "Never shows availability across the entire feed."))
            continue
        for i, d in enumerate(dates):
            if i < MIN_HISTORY:
                continue
            hist = seq[max(0, i - WINDOW):i]
            med, sigma = _robust(hist)
            x = seq[i]
            z = (x - med) / sigma
            # An anomaly is a *change* of meaningful size, flagged on the rising
            # edge only: z over threshold AND at least ABS_MARGIN units above the
            # baseline AND the previous day was still near-normal. This keeps the
            # signal sparse on bursty data (a 0->3 wiggle is not an alert).
            is_edge = seq[i - 1] < med + ABS_MARGIN
            if z >= Z_SPIKE and (x - med) >= ABS_MARGIN and is_edge:
                alerts.append(Alert(d, scope, "spike", x, round(med, 1), round(z, 1),
                                    f"{x} available vs rolling median {med:.0f} (+{x-med:.0f})."))
    # flapping units (status churn)
    c = sqlite3.connect(DB)
    rows = c.execute("""
        SELECT o.resource_name, p.park_group, a.date, a.is_available
        FROM availability a JOIN otentiks o ON a.resource_id=o.resource_id
        JOIN parks p ON o.park_id=p.park_id ORDER BY a.resource_id, a.date
    """).fetchall()
    c.close()
    from collections import defaultdict
    by_unit = defaultdict(list)
    for name, grp, d, st in rows:
        by_unit[(name, grp)].append((d, st))
    for (name, grp), seq in by_unit.items():
        flips = sum(1 for k in range(1, len(seq)) if seq[k][1] != seq[k - 1][1])
        # crude: many flips over the whole window
        if flips >= CHURN_FLIPS * 3:
            alerts.append(Alert(seq[0][0], grp, "flapping", flips, 0, 0.0,
                                f"Unit {name} toggled status {flips} times — possible scraper instability or rapid book/cancel."))
    return alerts


# ----------------------------- the triage agent --------------------------- #
def triage(alert: Alert, db_path: str = DB, llm=None) -> dict:
    """Gather SQL context for the alert and produce a verdict.

    This is the 'agent picks up on it' step. With `llm` (a LangChain chat model)
    it writes the narrative; without one it uses a deterministic classifier.
    """
    c = sqlite3.connect(db_path)
    context = {}
    if alert.scope != "system" and alert.kind in ("spike", "standing"):
        # which units are involved on that date
        units = c.execute("""
            SELECT o.resource_name, a.is_available FROM availability a
            JOIN otentiks o ON a.resource_id=o.resource_id
            JOIN parks p ON o.park_id=p.park_id
            WHERE p.park_group=? AND a.date=?
            ORDER BY o.resource_name
        """, (alert.scope, alert.date)).fetchall()
        context["units_available"] = [u[0] for u in units if u[1]]
    c.close()

    rules = {
        "spike": ("⚠️ Likely cancellation wave / block release",
                  "A sudden jump above baseline usually means many units freed at once "
                  "(group cancellation, inventory release, or hold expiry). Action: notify "
                  "watchers; verify against the source booking API."),
        "dropout": ("Sudden drop in availability",
                    "Inventory filled or pulled. Action: confirm it's real demand, not a scraper miss."),
        "standing": ("🛑 Data/listing anomaly — never bookable",
                     "A location that never shows availability across the whole feed is almost "
                     "certainly a listing or scraper-mapping issue. Action: re-verify the resource IDs."),
        "flapping": ("🌀 Flapping inventory",
                     "Frequent status toggling suggests scraper instability or rapid book/cancel churn. "
                     "Action: de-bounce the signal before alerting users."),
    }
    title, advice = rules.get(alert.kind, ("Anomaly", "Investigate."))
    severity = "high" if alert.kind in ("spike", "standing") else "medium"
    if llm is not None:
        prompt = (f"You are an availability-monitoring analyst. An anomaly was detected:\n"
                  f"scope={alert.scope} kind={alert.kind} date={alert.date} value={alert.value} "
                  f"baseline={alert.baseline} z={alert.z}. Context={context}. "
                  f"Classify it and recommend an action in 2 sentences.")
        narrative = getattr(llm.invoke(prompt), "content", "")
    else:
        narrative = advice
    return {"verdict": title, "severity": severity, "narrative": narrative, "context": context}


# ----------------------------- report ------------------------------------- #
def _spark_svg(dates, seq, alerts_for_scope, width=860, h=120):
    n = len(seq); padL, padB = 36, 16
    mx = max(seq + [1])
    xs = lambda i: padL + i * (width - padL - 10) / max(1, n - 1)
    ys = lambda v: (h - padB) - (v / mx) * (h - padB - 8)
    pts = " ".join(f"{xs(i):.1f},{ys(v):.1f}" for i, v in enumerate(seq))
    out = [f'<svg viewBox="0 0 {width} {h}" xmlns="http://www.w3.org/2000/svg">']
    out.append(f'<polyline points="{pts}" fill="none" stroke="#38bdf8" stroke-width="1.5"/>')
    out.append(f'<text x="4" y="14" fill="#9fb0c9" font-size="10" font-family="monospace">{mx}</text>')
    out.append(f'<text x="4" y="{h-padB}" fill="#9fb0c9" font-size="10" font-family="monospace">0</text>')
    didx = {d: i for i, d in enumerate(dates)}
    for a in alerts_for_scope:
        if a.date in didx and a.kind in ("spike", "dropout"):
            i = didx[a.date]; x = xs(i); y = ys(seq[i])
            out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="5" fill="#f87171" stroke="#0b1020"/>')
            out.append(f'<text x="{x:.1f}" y="{y-9:.1f}" fill="#f87171" font-size="9" text-anchor="middle" font-family="monospace">{a.date[5:]}</text>')
    out.append("</svg>")
    return "\n".join(out)


def write_report(dates, system, groups, alerts, injected):
    OUT.mkdir(exist_ok=True)
    series = {"system": system, **groups}
    by_scope: dict[str, list[Alert]] = {}
    for a in alerts:
        by_scope.setdefault(a.scope, []).append(a)

    cards = []
    sev_rank = {"high": 0, "medium": 1, "low": 2}
    for a in sorted(alerts, key=lambda a: (sev_rank.get(a.triage.get("severity", "low"), 3), a.date)):
        sev = a.triage.get("severity", "medium")
        col = {"high": "#f87171", "medium": "#fbbf24"}.get(sev, "#9fb0c9")
        ctx = a.triage.get("context", {})
        ctx_s = (f" · units: {', '.join(ctx['units_available'])}" if ctx.get("units_available") else "")
        cards.append(f"""<div class="al" style="border-left-color:{col}">
          <div><b style="color:{col}">{a.triage.get('verdict','')}</b>
          <span class="m">{a.scope} · {a.date} · {a.kind} · z={a.z}</span></div>
          <div class="d">{a.detail}{ctx_s}</div>
          <div class="adv">{a.triage.get('narrative','')}</div></div>""")

    charts = []
    for scope in ["system"] + list(groups.keys()):
        seq = [series[scope][d] for d in dates]
        if max(seq) == 0 and scope != "system":
            charts.append(f'<div class="ch"><div class="t">{scope} <span class="m">— never available (standing anomaly)</span></div></div>')
            continue
        charts.append(f'<div class="ch"><div class="t">{scope}</div>{_spark_svg(dates, seq, by_scope.get(scope, []))}</div>')

    inj = (f'<div class="callout"><b>Injected check:</b> a synthetic spike of +{injected["added"]} '
           f'units was added to {injected["group"]} on {injected["date"]}. '
           f'It {"WAS" if any(x.scope==injected["group"] and x.date==injected["date"] for x in alerts) else "was NOT"} '
           f'flagged below.</div>') if injected else ""

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>Live Anomaly Triage</title><style>
body{{margin:0;background:#0a0e14;color:#e9eef7;font-family:system-ui,Arial;line-height:1.5}}
main{{max-width:920px;margin:0 auto;padding:28px 22px 80px}} h1{{font-size:24px}}
h2{{font-size:17px;margin-top:26px;border-top:1px solid #1f2c44;padding-top:16px}}
.m{{color:#9fb0c9;font-size:12px;font-family:monospace}} .ch{{background:#0e141f;border:1px solid #1f2c44;border-radius:10px;padding:10px 12px;margin:10px 0}}
.ch .t{{font-size:13px;margin-bottom:4px}}
.al{{background:#0e141f;border:1px solid #1f2c44;border-left:4px solid #fbbf24;border-radius:10px;padding:11px 14px;margin:9px 0}}
.al .d{{color:#cbd5e1;font-size:13px;margin-top:3px}} .al .adv{{color:#9fb0c9;font-size:12.5px;margin-top:5px}} .al .m{{margin-left:8px}}
.callout{{background:#0d1626;border-left:4px solid #76b900;border-radius:10px;padding:12px 14px;margin:14px 0;font-size:13.5px}}
.kpi{{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}} .kpi div{{background:#111927;border:1px solid #1f2c44;border-radius:10px;padding:10px 14px}}
.kpi b{{font-size:22px;color:#a4e028;font-family:monospace;display:block}}
.look{{background:#0d1626;border-left:4px solid #fbbf24;border-radius:10px;padding:14px;margin:16px 0;font-size:13.5px}}
</style></head><body><main>
<h1>🚨 Live Anomaly Triage — oTENTik availability feed</h1>
<p class="m">{len(dates)} daily snapshots replayed as a live feed · detector + triage agent · key-free demo</p>
{inj}
<div class="kpi">
  <div><b>{len(alerts)}</b><span class="m">alerts raised</span></div>
  <div><b>{sum(1 for a in alerts if a.triage.get('severity')=='high')}</b><span class="m">high severity</span></div>
  <div><b>{len(dates)}</b><span class="m">events processed</span></div>
</div>
<h2>Triaged alerts</h2>
{''.join(cards) if cards else '<p class="m">No anomalies flagged.</p>'}
<h2>Signals (red dot = flagged)</h2>
{''.join(charts)}
<div class="look"><b>🔎 What to look for</b><ul>
<li><b>Spikes</b> (red dots): availability jumping far above its rolling baseline → cancellation wave / inventory release. The most actionable signal for a booking watcher.</li>
<li><b>Standing anomalies</b>: a location that's <i>never</i> available across the whole feed → almost always a data/listing bug, not real scarcity.</li>
<li><b>Flapping</b>: a unit toggling status many times → scraper instability or rapid book/cancel; de-bounce before alerting humans.</li>
<li><b>Severity</b>: triage tags high vs medium so a human reviews the right ones first (this is the alert_triage_agent idea — the LLM is spent only on what the cheap detector already flagged).</li>
</ul></div>
</main></body></html>"""
    (OUT / "anomaly_report.html").write_text(html)
    (OUT / "alerts.json").write_text(json.dumps(
        [{"date": a.date, "scope": a.scope, "kind": a.kind, "z": a.z,
          "value": a.value, "triage": a.triage} for a in alerts], indent=2))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inject", action="store_true", help="inject a synthetic anomaly to verify detection")
    args = ap.parse_args()
    dates, system, groups = load_series()
    injected = inject_anomaly(dates, system, groups) if args.inject else None
    alerts = detect(dates, system, groups)
    for a in alerts:
        a.triage = triage(a)
    write_report(dates, system, groups, alerts, injected)
    print(f"Processed {len(dates)} events · raised {len(alerts)} alerts "
          f"({sum(1 for a in alerts if a.triage.get('severity')=='high')} high).")
    for a in alerts:
        print(f"  [{a.triage.get('severity'):>6}] {a.scope:38} {a.date} {a.kind:8} z={a.z}")
    print(f"Report: {OUT/'anomaly_report.html'}")
    if injected:
        hit = any(a.scope == injected["group"] and a.date == injected["date"] for a in alerts)
        print(f"Injected anomaly on {injected['date']} ({injected['group']}): {'CAUGHT ✓' if hit else 'MISSED ✗'}")


if __name__ == "__main__":
    main()
