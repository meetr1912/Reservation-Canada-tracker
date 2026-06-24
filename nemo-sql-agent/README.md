# Self-Improving Text-to-SQL Agent — NeMo Agent Toolkit + LangGraph + LangSmith

A complete, runnable NeMo Agent Toolkit example built on **this repo's own
data**: a self-correcting LangGraph agent that answers natural-language
questions about Parks Canada oTENTik availability by writing SQL — plus an
**evidence-based guide** and an **interactive visualization** of how to improve
a SQL-writing agent, grounded in published BIRD/Spider results.

It demonstrates the toolkit end to end: wrap an existing LangGraph agent →
trace it in LangSmith → evaluate execution accuracy → auto-optimize the proven
techniques → compound gains with a data flywheel.

```
nemo-sql-agent/
├── README.md                      ← you are here
├── docs/
│   ├── GUIDE.md                   ← evidence-based "what works / what doesn't / compounding returns"
│   └── visualization.html         ← interactive educational page (open in a browser)
├── configs/
│   ├── text_to_sql.yml            ← nat run / serve / mcp — the workflow + LangSmith tracing
│   ├── eval.yml                   ← nat eval — custom execution-accuracy evaluator + profiler
│   └── optimizer.yml              ← nat optimize — search the technique switches (self-improvement)
├── data/
│   ├── otentiks.db                ← SQLite DB built from the repo's JSON (generated)
│   ├── eval_dataset.json          ← 18 NL→gold-SQL pairs (easy/medium/hard)
│   └── nat_eval_dataset.json      ← same, in NeMo eval's flat format
├── scripts/build_db.py            ← builds the normalized DB from otentiks.json + availability_report.json
├── src/nemo_sql_agent/
│   ├── graph.py                   ← the LangGraph state machine (link→generate→execute→correct→vote)
│   ├── db.py                      ← read-only execution + M-Schema rendering
│   ├── schema_linking.py          ← high-recall schema linking
│   ├── examples.py                ← similarity few-shot bank (grown by the flywheel)
│   ├── eval.py                    ← execution-accuracy eval + ablation ladder
│   ├── self_improve.py            ← the self-improvement flywheel
│   ├── simulate.py                ← offline, literature-calibrated compounding curve (no API key)
│   └── register.py                ← @register_function + @register_evaluator (NeMo Agent Toolkit)
└── tests/test_agent.py            ← end-to-end tests with a stub LLM (no API key)
```

## The database

The tracker already produces `otentiks.json` (122 units across 12 park
locations) and `availability_report.json` (180 days of per-unit availability).
`build_db.py` normalizes these into three tables that require joins, date math,
and aggregation — a realistic text-to-SQL target:

```
parks(park_id, park_name, park_group, location, province)
otentiks(resource_id, park_id, resource_name, page_title)
availability(resource_id, date, is_available)
```

Example question → SQL the agent learns to write:
> *"Which park groups have an oTENTik available on 2026-07-01?"* →
> `SELECT DISTINCT p.park_group FROM availability a JOIN otentiks o ON … JOIN parks p ON … WHERE a.date='2026-07-01' AND a.is_available=1;`

## Quickstart (no API key needed)

```bash
cd nemo-sql-agent
python scripts/build_db.py                          # build data/otentiks.db
PYTHONPATH=src python -m pytest tests/ -q            # or: python tests/test_agent.py
PYTHONPATH=src python -m nemo_sql_agent.simulate     # print the compounding-returns ladder
open docs/visualization.html                         # interactive guide
```

The tests run the full LangGraph agent (including the self-correction loop and
self-consistency vote) against the real DB using a deterministic stub LLM.

## Run it for real with the NeMo Agent Toolkit

```bash
pip install -e ".[nat,nim]"                          # nvidia-nat[langchain,eval,profiler] + langgraph + NIM
export NVIDIA_API_KEY=...                            # for the NIM model
export LANGSMITH_API_KEY=...                          # for tracing (optional)

# 1. Ask a question (also: nat serve, nat mcp serve)
nat run --config_file configs/text_to_sql.yml \
        --input "How many oTENTiks in New Brunswick are available on 2026-06-15?"

# 2. Evaluate execution accuracy + latency + token cost (with profiler)
nat eval --config_file configs/eval.yml

# 3. Let the optimizer search the proven technique switches
nat optimize --config_file configs/optimizer.yml
```

Swap the LLM (NIM → OpenAI/local) or the tracer (LangSmith → Phoenix/Weave/
Langfuse) by editing YAML only — the agent code does not change.

## How it maps to the guide

Every technique in [`docs/GUIDE.md`](docs/GUIDE.md) is a switch in
`graph.AgentConfig` and a search dimension in `configs/optimizer.yml`:

| Guide technique | Code | Config |
|---|---|---|
| High-recall schema linking + M-Schema | `schema_linking.py`, `db.render_m_schema` | `use_schema_linking` |
| Structured chain-of-thought | `graph._build_prompt` | `use_cot` |
| Similarity few-shot (k≈3) | `examples.select_examples` | `num_few_shot` |
| Execution-grounded self-correction | `graph` correct loop | `max_corrections` |
| Multi-candidate + execution vote | `graph` vote node | `self_consistency_n` |
| Execution-accuracy metric | `register.sql_execution_accuracy` | `eval.evaluators` |
| Self-improvement flywheel | `self_improve.run_flywheel` | — |

> Version note: `register.py` and the configs follow the current `nvidia-nat`
> (`nat.*`) namespace and documented patterns. Pin to your installed toolkit
> version — minor keyword/entry-point differences exist across 1.x releases.
