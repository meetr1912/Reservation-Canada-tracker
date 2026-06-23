"""Runnable profiler + observability demo for the text-to-SQL agent.

WHY THIS EXISTS
---------------
NeMo Agent Toolkit's profiler/observability needs a live LLM (and an API key) to
produce traces. This script lets you SEE the same kind of output with **no API
key**: it runs the real LangGraph agent against the real SQLite database using a
deterministic "replay" model that returns the correct SQL with *simulated*
realistic latencies — and deliberately fails one query on the first attempt so
the **self-correction loop shows up in the trace**.

It emits exactly the artifact types NAT's profiler does, so what you learn here
transfers directly:

    profile_report.html   <- OPEN THIS: SVG trace waterfalls + latency/token
                             tables + "what to look for" annotations
    spans.csv             <- per-span timing/tokens (like standardized_data_all.csv)
    summary.json          <- p50/p90/p95 latency + token totals (like
                             inference_optimization.json)

Run:
    cd nemo-sql-agent
    PYTHONPATH=src python observability/profile_run.py
    # then open observability/out/profile_report.html

With a REAL model instead of the replay stub (real latencies/tokens), set
NAT_DEMO_REAL=1 and provide a LangChain chat model in your own wrapper — or just
run the agent through `nat eval` with the profiler (see observability/README.md).
"""
from __future__ import annotations

import json
import random
import statistics
import time
from pathlib import Path

import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from nemo_sql_agent.graph import AgentConfig, build_sql_agent_graph  # noqa: E402

OUT = Path(__file__).resolve().parent / "out"
DB = str(ROOT / "data" / "otentiks.db")
DATASET = json.loads((ROOT / "data" / "eval_dataset.json").read_text())["items"]

# A few representative questions; q01 is rigged to fail once (shows correction).
DEMO_IDS = ["q01", "q05", "q07", "q08", "q12"]
GOLD = {it["id"]: it for it in DATASET}

# global LLM-call ledger: (t_wall, tokens_in, tokens_out, kind)
_CALLS: list[tuple[float, int, int, str]] = []


def _toks(s: str) -> int:
    return max(1, len(s) // 4)  # rough token estimate (chars/4)


class ReplayLLM:
    """No-key model: returns the gold SQL for the question in the prompt, with a
    simulated latency. For the first DEMO id it returns a broken query on the
    first attempt so the execution-feedback correction loop is exercised."""

    def __init__(self, seed: int = 7):
        self.rng = random.Random(seed)
        self._first_seen: set[str] = set()

    def invoke(self, prompt: str):
        # simulate model latency (clearly fake; real models replace this)
        time.sleep(self.rng.uniform(0.35, 0.95))
        # find which question this prompt is about
        qline = next((ln for ln in prompt.splitlines() if ln.startswith("Question:")), "")
        question = qline.replace("Question:", "").strip()
        item = next((it for it in DATASET if it["question"] == question), None)
        gold = item["gold_sql"] if item else "SELECT 1"
        is_correction = "Engine error" in prompt or "fix it" in prompt.lower()
        # rig q01 to fail once on the first (non-correction) attempt
        broken = (
            item is not None
            and item["id"] == DEMO_IDS[0]
            and not is_correction
            and item["id"] not in self._first_seen
        )
        if broken:
            self._first_seen.add(item["id"])
            out = "```sql\nSELECT COUNT(*) FROM otentik\n```"  # wrong table name
        else:
            out = f"```sql\n{gold}\n```"
        _CALLS.append((time.perf_counter(), _toks(prompt), _toks(out),
                       "correct" if is_correction else "generate"))
        return out


def run_one(graph, question: str):
    """Run the graph for one question, capturing per-node spans by streaming."""
    spans = []
    t0 = time.perf_counter()
    last = t0
    final = {}
    for update in graph.stream({"question": question}, stream_mode="updates"):
        now = time.perf_counter()
        for node, state in update.items():
            # tokens attributed to this span = LLM calls that landed in [last, now]
            tin = sum(c[1] for c in _CALLS if last <= c[0] <= now)
            tout = sum(c[2] for c in _CALLS if last <= c[0] <= now)
            spans.append({"node": node, "start": last - t0, "end": now - t0,
                          "dur": now - last, "tok_in": tin, "tok_out": tout})
            if isinstance(state, dict):
                final.update(state)
        last = now
    return spans, (last - t0), final


# ---------- rendering helpers (self-contained SVG, no deps) ----------
NODE_COLOR = {
    "link_schema": "#38bdf8", "select_examples": "#22d3ee", "generate": "#76b900",
    "execute": "#fbbf24", "correct": "#f87171", "vote": "#a78bfa",
}


def _gantt_svg(spans, total, width=820):
    rowh, padL, padT = 26, 150, 28
    h = padT + rowh * len(spans) + 30
    scale = (width - padL - 20) / max(total, 1e-6)
    out = [f'<svg viewBox="0 0 {width} {h}" xmlns="http://www.w3.org/2000/svg">']
    # time gridlines every 0.5s
    t = 0.0
    while t <= total:
        x = padL + t * scale
        out.append(f'<line x1="{x:.0f}" y1="{padT-6}" x2="{x:.0f}" y2="{h-24}" stroke="#1f2c44"/>')
        out.append(f'<text x="{x:.0f}" y="{h-8}" fill="#9fb0c9" font-size="10" text-anchor="middle" font-family="monospace">{t:.1f}s</text>')
        t += 0.5
    for i, s in enumerate(spans):
        y = padT + i * rowh
        x = padL + s["start"] * scale
        w = max(3, s["dur"] * scale)
        c = NODE_COLOR.get(s["node"], "#64748b")
        out.append(f'<text x="{padL-8}" y="{y+15}" fill="#cbd5e1" font-size="11" text-anchor="end" font-family="monospace">{s["node"]}</text>')
        out.append(f'<rect x="{x:.0f}" y="{y+4}" width="{w:.0f}" height="16" rx="3" fill="{c}" opacity="0.85"/>')
        lbl = f'{s["dur"]*1000:.0f}ms'
        if s["tok_in"] or s["tok_out"]:
            lbl += f' · {s["tok_in"]}->{s["tok_out"]}tok'
        out.append(f'<text x="{x+w+6:.0f}" y="{y+16}" fill="#9fb0c9" font-size="10" font-family="monospace">{lbl}</text>')
    out.append("</svg>")
    return "\n".join(out)


def main():
    OUT.mkdir(exist_ok=True)
    cfg = AgentConfig(db_path=DB, use_schema_linking=True, use_cot=True,
                      num_few_shot=3, max_corrections=2, self_consistency_n=1)
    graph = build_sql_agent_graph(ReplayLLM(), cfg)

    runs, all_spans_rows = [], []
    for qid in DEMO_IDS:
        _CALLS.clear()
        q = GOLD[qid]["question"]
        spans, total, final = run_one(graph, q)
        ok = bool(final.get("result") and final["result"].ok)
        runs.append({"id": qid, "q": q, "spans": spans, "total": total,
                     "ok": ok, "sql": final.get("sql", "")})
        for s in spans:
            all_spans_rows.append({"question_id": qid, **s})

    # ---- summary.json (NAT inference_optimization.json analogue) ----
    totals = [r["total"] for r in runs]
    tok_in = sum(s["tok_in"] for r in runs for s in r["spans"])
    tok_out = sum(s["tok_out"] for r in runs for s in r["spans"])
    def pct(xs, p):
        xs = sorted(xs); k = max(0, min(len(xs) - 1, int(round((p / 100) * (len(xs) - 1)))))
        return round(xs[k], 3)
    summary = {
        "runs": len(runs),
        "latency_seconds": {"p50": pct(totals, 50), "p90": pct(totals, 90),
                            "p95": pct(totals, 95), "mean": round(statistics.mean(totals), 3),
                            "max": round(max(totals), 3)},
        "tokens": {"prompt": tok_in, "completion": tok_out, "total": tok_in + tok_out,
                   "avg_per_run": round((tok_in + tok_out) / len(runs), 1)},
        "self_corrections": sum(1 for r in runs for s in r["spans"] if s["node"] == "correct"),
        "note": "Latencies are SIMULATED by the replay model for demonstration. "
                "Run via a live LLM (or `nat eval` with the profiler) for real numbers.",
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2))

    # ---- spans.csv (NAT standardized_data_all.csv analogue) ----
    import csv
    with open(OUT / "spans.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["question_id", "node", "start", "end", "dur", "tok_in", "tok_out"])
        w.writeheader()
        for row in all_spans_rows:
            w.writerow({k: (round(v, 4) if isinstance(v, float) else v) for k, v in row.items()})

    # ---- profile_report.html (the thing you OPEN) ----
    _write_html(runs, summary)
    print(f"Wrote artifacts to {OUT}/")
    print(f"  open: {OUT/'profile_report.html'}")
    print(f"  latency p50={summary['latency_seconds']['p50']}s "
          f"p95={summary['latency_seconds']['p95']}s · "
          f"tokens/run={summary['tokens']['avg_per_run']} · "
          f"self-corrections={summary['self_corrections']}")


def _write_html(runs, summary):
    blocks = []
    for r in runs:
        spans_n = ", ".join(s["node"] for s in r["spans"])
        corrected = any(s["node"] == "correct" for s in r["spans"])
        badge = ("<span style='color:#f87171'>● self-corrected</span>" if corrected
                 else "<span style='color:#76b900'>● clean</span>")
        status = "<span style='color:#76b900'>✓ correct</span>" if r["ok"] else "<span style='color:#f87171'>✗ wrong</span>"
        blocks.append(f"""
        <div class="run">
          <div class="rh"><b>{r['id']}</b> — {r['q']} &nbsp; {status} &nbsp; {badge}
            <span class="t">{r['total']*1000:.0f} ms total</span></div>
          {_gantt_svg(r['spans'], r['total'])}
          <details><summary>generated SQL</summary><pre>{r['sql']}</pre></details>
        </div>""")
    s = summary["latency_seconds"]; tk = summary["tokens"]
    legend = "".join(f'<span><i style="background:{c}"></i>{n}</span>' for n, c in NODE_COLOR.items())
    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>SQL Agent — Profiler &amp; Trace Report</title><style>
body{{margin:0;background:#0a0e14;color:#e9eef7;font-family:system-ui,Arial;line-height:1.5}}
main{{max-width:920px;margin:0 auto;padding:30px 22px 80px}}
h1{{font-size:26px}} h2{{font-size:18px;margin-top:30px;border-top:1px solid #1f2c44;padding-top:18px}}
.kpis{{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0}}
.kpi{{background:#111927;border:1px solid #1f2c44;border-radius:12px;padding:12px 16px;min-width:130px}}
.kpi b{{font-size:24px;color:#a4e028;font-family:monospace}} .kpi span{{color:#9fb0c9;font-size:12px;display:block}}
.run{{background:#0e141f;border:1px solid #1f2c44;border-radius:12px;padding:14px;margin:14px 0}}
.rh{{font-size:14px;margin-bottom:6px}} .rh .t{{float:right;color:#9fb0c9;font-family:monospace;font-size:12px}}
.legend{{display:flex;gap:14px;flex-wrap:wrap;color:#9fb0c9;font-size:12px;margin:8px 0 18px}}
.legend i{{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:5px;vertical-align:middle}}
pre{{background:#070d18;border:1px solid #1f2c44;border-radius:8px;padding:10px;overflow:auto;font-size:12px;color:#cfe3ff}}
summary{{cursor:pointer;color:#7dd3fc;font-size:12px}}
.look{{background:#0d1626;border-left:4px solid #fbbf24;border-radius:10px;padding:14px 16px;margin:16px 0}}
.look h3{{margin:0 0 6px}} .look li{{color:#cbd5e1;font-size:13.5px;margin:4px 0}}
.warn{{color:#fbbf24}}
</style></head><body><main>
<h1>🔭 SQL Agent — Profiler &amp; Trace Report</h1>
<p style="color:#9fb0c9">Real LangGraph agent over the oTENTik SQLite DB. <span class="warn">Latencies are simulated by the no-key replay model</span> so you can read the visuals; structure, token flow, and the self-correction loop are real.</p>
<div class="kpis">
  <div class="kpi"><b>{s['p50']}s</b><span>latency p50</span></div>
  <div class="kpi"><b>{s['p95']}s</b><span>latency p95</span></div>
  <div class="kpi"><b>{s['max']}s</b><span>slowest run</span></div>
  <div class="kpi"><b>{tk['avg_per_run']}</b><span>tokens / run</span></div>
  <div class="kpi"><b>{summary['self_corrections']}</b><span>self-corrections</span></div>
</div>
<div class="legend">{legend}</div>
<h2>Per-question trace waterfalls</h2>
{''.join(blocks)}
<div class="look"><h3>🔎 What to look for</h3><ul>
<li><b>The widest bar = your bottleneck.</b> Here <code>generate</code>/<code>correct</code> (LLM calls) dominate — that's normal. If <code>execute</code> (DB) or <code>link_schema</code> were wide, you'd optimize SQL/indexes or the schema retriever instead.</li>
<li><b>A red <code>correct</code> bar = the model's first SQL failed and was repaired from the DB error.</b> A few are healthy (self-healing). Many means weak generation — improve schema linking / few-shot, or the base model.</li>
<li><b>Token count per span</b> (the <code>in-&gt;out</code> label): a large <code>in</code> on <code>generate</code> means your schema/few-shot prompt is heavy → prune schema or cut examples (the guide shows ~3 is the sweet spot).</li>
<li><b>p95 ≫ p50</b> means a few slow tails (often extra correction rounds). Watch the gap, not just the average.</li>
<li><b>Total bars per run</b> = pipeline depth. More stages = more accuracy but more latency/cost — that trade-off is exactly what <code>nat optimize</code> searches.</li>
</ul></div>
<p style="color:#5f7390;font-size:12px">Artifacts: <code>profile_report.html</code> (this) · <code>spans.csv</code> · <code>summary.json</code>. In NAT these correspond to the trace waterfall (Phoenix), <code>standardized_data_all.csv</code>, and <code>inference_optimization.json</code>.</p>
</main></body></html>"""
    (OUT / "profile_report.html").write_text(html)


if __name__ == "__main__":
    main()
