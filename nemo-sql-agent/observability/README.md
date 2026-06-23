# Observability & Profiling — run it and learn to read it

Two ways to **see your text-to-SQL agent run**, both working with **no LLM API key**
(a deterministic "replay" model returns the correct SQL with simulated latencies and
deliberately fails one query so the self-correction loop appears):

| Path | What you get | Needs |
| --- | --- | --- |
| **A · Offline report** | A self-contained `profile_report.html` with SVG trace waterfalls + latency/token tables + a "what to look for" panel | nothing (langgraph only) |
| **B · Live Phoenix** | Real-time trace waterfalls streaming into the Phoenix UI — exactly like NAT's `phoenix` telemetry exporter | `arize-phoenix` + a running Phoenix |

This mirrors what the NeMo Agent Toolkit gives you: **live tracing** (Phoenix/Weave/LangSmith)
for watching individual runs, and the **profiler** (`nat eval`) for repeatable statistical reports.

---

## Path A — offline report (start here)

```bash
cd nemo-sql-agent
PYTHONPATH=src python observability/profile_run.py
# then open observability/out/profile_report.html in any browser
```
Produces in `observability/out/`:
- **`profile_report.html`** — open this. Per-question trace waterfalls (one bar per LangGraph node), KPI tiles (p50/p95 latency, tokens/run, self-corrections), and an annotated "what to look for" panel.
- `spans.csv` — per-span timing & tokens (the analogue of NAT's `standardized_data_all.csv`).
- `summary.json` — p50/p90/p95 latency + token totals (the analogue of NAT's `inference_optimization.json`).

> Latencies are **simulated** by the replay model so the visuals are readable; structure,
> token flow, and the self-correction loop are real. Swap in a live LLM for real numbers.

## Path B — live traces in Phoenix (what production looks like)

```bash
# 1) install (Phoenix is the viewer; the agent stays key-free)
pip install arize-phoenix opentelemetry-sdk opentelemetry-exporter-otlp-proto-http

# 2) launch a local Phoenix viewer — UI at http://localhost:6006
docker run -it --rm -p 6006:6006 -p 4317:4317 arizephoenix/phoenix:latest
#    (or, pip-only:  python -m phoenix.server.main serve )

# 3) in another shell, stream the agent's traces in:
cd nemo-sql-agent
PYTHONPATH=src python observability/phoenix_live.py

# 4) open http://localhost:6006  ->  watch the trace waterfalls appear
```
No Phoenix? Print the spans to your terminal instead: `python observability/phoenix_live.py --console`.

**Verified:** streaming the 5 demo questions emits **32 spans** — 5 parent `sql_agent:*`
chains, plus `link_schema`/`select_examples`/`generate`/`execute`/`vote` per run, and the
extra `execute`+`correct` pair from q01's self-correction.

### Wiring the *real* NeMo Agent Toolkit profiler
When you run the agent through NAT (see `../configs/eval.yml`), add live tracing with one block —
no code change:
```yaml
general:
  telemetry:
    tracing:
      phoenix: { _type: phoenix, endpoint: http://localhost:6006/v1/traces, project: otentik-sql }
```
and enable the profiler under `eval.general.profiler` (bottleneck_analysis, compute_llm_metrics, …)
to get `gantt_chart.png`, `inference_optimization.json`, and `workflow_profiling_report.txt`.

---

## 🔎 What to look for (read your traces like a pro)

A trace is a **waterfall**: each bar is one step (a LangGraph node = an LLM call or a tool/DB call),
positioned by start time, with width = duration. Here's how to diagnose one.

### 1. Find the bottleneck — the widest bar
- **`generate` / `correct` widest** → normal; LLM calls dominate text-to-SQL. Lever: smaller/faster model, fewer tokens, fewer correction rounds.
- **`execute` widest** → the *database* is slow. Lever: add indexes, fix the generated SQL shape, add `LIMIT`.
- **`link_schema` widest** → schema retrieval is heavy (big schemas). Lever: cache it, or use a faster retriever.

### 2. Self-correction rate — count the red `correct` bars
- **A few** → healthy; the agent is repairing its own bad SQL from the DB error (that's the point).
- **Many / every run** → generation is weak. Lever: better schema linking, add ~3 similarity few-shot examples, or a stronger base model. (See `../docs/GUIDE.md` for the evidence.)
- **Zero ever, but accuracy is low** → your `max_corrections` is 0, or errors aren't being fed back — turn the loop on.

### 3. Token flow — the `in→out` label on each LLM span
- **Large prompt (`in`) on `generate`** → your schema + few-shot block is bloated. Lever: prune the schema (high-recall linking), cut few-shot to ~3. Big prompts cost money *and* hurt accuracy ("lost in the middle").
- **Tiny `out`** is expected for SQL. A huge `out` means the model is rambling — tighten the prompt.

### 4. Latency distribution — compare p50 vs p95 (in `summary.json` / KPI tiles)
- **p95 ≫ p50** → a few slow tails, usually extra correction rounds or a slow tool. Optimize the *tail*, not the average — users feel the tail.
- Track p95 as your SLO; it's what `nat sizing calc` uses to estimate how many GPUs/users you can serve.

### 5. Pipeline depth — how many bars per run
- More stages (schema-link + CoT + few-shot + correct + vote) = more accuracy **but** more latency and tokens. That accuracy↔cost trade-off is exactly what `nat optimize` searches (Pareto front). Use the trace to decide which stage earns its keep.

### 6. Span attributes (in Phoenix, click a span)
- `execute.ok=false` + `execute.error` → the exact engine error that triggered a correction. Reading these tells you *what kind* of mistakes your model makes (wrong table? bad column? bad date filter?) → that's your next training/few-shot target.
- `llm.token_count.prompt/completion` → per-call cost.

> **Rule of thumb:** the trace answers *"where did the time/tokens go, and did the agent
> have to fix itself?"* — then `nat eval` quantifies it, and `nat optimize` improves it.
> You can't improve what you can't see.
