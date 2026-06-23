# Feeding live data & detecting anomalies with a NAT agent

This answers: *how do we feed live data into the agent architecture and see if it
picks up anomalies?* — grounded in NVIDIA's own docs, then made concrete with a
runnable demo over the oTENTik availability feed.

## The one architectural truth to internalize first

**The NeMo Agent Toolkit is request/response.** There is **no native stream
processor, no scheduler/cron, and no continuous-listener primitive** (the
`front_ends/cron/` directory on `develop` is an empty stub). A workflow is a
function that runs once per invocation and returns. So "live data" is achieved
in exactly two shapes:

1. **PUSH** — an external system sends each event to the API (`nat serve`).
2. **PULL** — the agent fetches fresh data at runtime via tools / MCP / retrievers.

NVIDIA's own flagship "live monitoring" example proves this: the
[`alert_triage_agent`](https://github.com/NVIDIA/NeMo-Agent-Toolkit/blob/develop/examples/advanced_agents/alert_triage_agent/README.md)
ships a **custom external Flask server** (`run.py`, `POST /alerts`) that calls
`nat run` once per alert. The continuous loop is *yours to build*; NAT supplies
the agent, not the trigger.

## How to feed live data (pick per latency/throughput need)

| Shape | Mechanism | When to use |
|---|---|---|
| Push, sync | `POST /v1/workflow` (or `/v1/chat`) | one event in, verdict out |
| Push, streaming | `POST /v1/workflow/stream` / `/full` (SSE) | watch the agent's steps live; `?filter_steps=LLM_END,TOOL_END` |
| Push, long/batch | `POST /v1/workflow/async` + poll `/v1/workflow/async/job/{id}` (extra `nvidia-nat[async_endpoints]`, Dask) | fan-out, jobs that outlast a client timeout |
| Push, persistent channel | WebSocket `/websocket` — client keeps the socket open and pushes a stream of `user_message`s (each = one run) | dashboards, HITL, bidirectional |
| Pull | a **tool / MCP client / retriever** queries your live DB/metrics API each run | agent gathers fresh context itself |
| Schedule | OS cron / your queue consumer invokes `nat run` or the REST API on a cadence | periodic sweeps (no built-in scheduler) |
| State across events | a `*_memory` provider (`mem0_memory` / `redis_memory` / `zep_memory`) | rolling baselines, "is this new event unusual vs history" |

Streaming endpoints stream **results out**; they do not consume an input stream.
A workflow streams output by registering a `stream_fn` (an async generator that
`yield`s) on its `FunctionInfo`.

## How the agent actually "picks up" an anomaly

From the `alert_triage_agent`: anomaly judgement is **LLM reasoning plus a hard
rule gate**, not a built-in statistical detector. The toolkit's guidance is
explicit — *if you need numeric anomaly detection, put it behind a tool the
agent calls.* The proven shape is:

```
            ┌────────────── live feed (push or pull) ──────────────┐
event ──▶ [ maintenance / benign gate ] ──┐ (expected? → stop, "benign")
                                           ▼
                                 [ detector tool ]  ← numeric anomaly detection
                                           │  (candidate alerts)
                                           ▼
                          [ agent investigation loop ]  ← pulls context via tools
                                           │
                                           ▼
                              [ categorizer / triage ]  ← label + severity + action
                                           ▼
                              report → human review (HITL)
```

- **Maintenance/benign gate** (`maintenance_check`): a cheap hard filter that
  short-circuits expected events so the LLM is never spent on them.
- **Detector tool**: deterministic numeric detection (z-score, thresholds,
  data-quality rules). Always-on, cheap.
- **Agent loop**: only the flagged candidates reach the LLM, which pulls extra
  context (the tool-calling loop) and reasons.
- **Categorizer**: buckets the result into labels (the example uses `software`,
  `network_connectivity`, `hardware`, `repetitive_behavior`, `false_positive`,
  `need_investigation`) + severity, for analyst review.
- Quality is measured with `nat eval` (the example adds a custom
  `classification_accuracy` evaluator alongside `ragas`).

> Two complementary kinds of "anomaly": **business-data anomalies** (this demo —
> unusual availability) and **architecture/runtime anomalies** (the profiler's
> `concurrency_spike_analysis` + `spike_threshold` and `workflow_runtime_forecast`,
> and `nat eval` wired into CI to catch quality regressions).

## The runnable demo here (`anomaly_demo.py`)

A faithful, key-free instance of that pattern over the oTENTik feed:

```bash
cd nemo-sql-agent
PYTHONPATH=src python anomaly/anomaly_demo.py --inject
# open anomaly/out/anomaly_report.html
```
- **Feed**: replays the 180 daily snapshots as a live event stream (`--inject`
  adds a synthetic +22-unit spike so you can verify detection).
- **Detector (the "tool")**: rolling robust-baseline (median/MAD) z-score, flagged
  only on the *rising edge* and above an absolute margin (so a 0→3 wiggle isn't an
  alert), plus data-quality rules — `standing` (a location never bookable across
  the whole feed → Grand-Pré) and `flapping` (a unit toggling status excessively).
- **Triage (the "agent")**: gathers SQL context for each alert (which units),
  classifies it (cancellation wave / data bug / flapping), assigns severity, and
  writes a recommended action. Deterministic by default; pass a LangChain chat
  model to have a real LLM write the narrative.
- **Verified**: the injected spike is **caught** (Fundy 2026-04-08, z=23).

Map it to NAT for production: wrap `detect()` as a `@register_function` tool, put
`maintenance_check`-style gating in front, let a `tool_calling_agent` call the
detector + SQL tools, add a categorizer, and serve it behind `nat serve` (or the
Flask-listener pattern) so your monitoring system POSTs snapshots to it.

## 🔎 What to look for (reading the report)

- **Spikes (red dots)** — availability jumping far above its rolling baseline =
  cancellation wave / inventory release. The most actionable booking signal.
- **Standing anomalies** — a location *never* available across the whole feed is
  almost always a data/listing bug, not real scarcity. Fix the pipeline, not the
  forecast.
- **Flapping** — a unit toggling status repeatedly = scraper instability or rapid
  book/cancel churn; **de-bounce before alerting humans** (otherwise you page on noise).
- **Severity tiering** — triage marks high vs medium so the analyst reviews the
  right ones first. This is the whole point of the gate+detector+triage split:
  spend the expensive LLM (and the human) only on what survived the cheap filters.
- **False-positive rate** — if everything is "high", your detector threshold is too
  tight; tune `Z_SPIKE` / `ABS_MARGIN`. Measure triage accuracy with `nat eval` + a
  classification evaluator, exactly as the alert_triage_agent does.

## Sources
- Alert Triage Agent: https://github.com/NVIDIA/NeMo-Agent-Toolkit/tree/develop/examples/advanced_agents/alert_triage_agent
- Vulnerability Analysis Blueprint (CVE triage, HITL): https://github.com/NVIDIA/NeMo-Agent-Toolkit/blob/develop/examples/advanced_agents/vulnerability_analysis_blueprint/README.md
- REST API (stream/full/async): https://github.com/NVIDIA/NeMo-Agent-Toolkit/blob/develop/docs/source/reference/rest-api/api-server-endpoints.md
- WebSocket protocol: https://github.com/NVIDIA/NeMo-Agent-Toolkit/blob/develop/docs/source/reference/rest-api/websockets.md
- Profiler (spike/runtime forecast): https://github.com/NVIDIA/NeMo-Agent-Toolkit/blob/develop/docs/source/improve-workflows/profiler.md
- Data Flywheel (outbound traffic capture): https://github.com/NVIDIA/NeMo-Agent-Toolkit/blob/develop/docs/source/run-workflows/observe/observe-workflow-with-data-flywheel.md
- MCP client (pull live data): https://github.com/NVIDIA/NeMo-Agent-Toolkit/blob/develop/packages/nvidia_nat_mcp/src/nat/plugins/mcp/client/client_config.py
