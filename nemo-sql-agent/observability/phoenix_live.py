"""Stream LIVE traces from the text-to-SQL agent into Arize Phoenix (or any
OTLP viewer) — no LLM API key required.

This emits one OpenTelemetry span per LangGraph node (link_schema, generate,
execute, correct, vote) with token, SQL, and status attributes, so you can watch
the trace waterfall update in Phoenix exactly as you would with the NeMo Agent
Toolkit's `phoenix` telemetry exporter.

QUICK START (on your desktop)
-----------------------------
    pip install arize-phoenix opentelemetry-sdk opentelemetry-exporter-otlp-proto-http
    # 1) launch a local Phoenix viewer (UI at http://localhost:6006)
    docker run -it --rm -p 6006:6006 -p 4317:4317 arizephoenix/phoenix:latest
    #    (or:  python -m phoenix.server.main serve )
    # 2) in another shell, stream traces into it:
    cd nemo-sql-agent
    PYTHONPATH=src python observability/phoenix_live.py
    # 3) open http://localhost:6006 -> project "otentik-sql-agent" -> watch traces

No Phoenix handy? Print spans to the console instead (fully offline):
    PYTHONPATH=src python observability/phoenix_live.py --console
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter, SimpleSpanProcessor

from nemo_sql_agent.graph import AgentConfig, build_sql_agent_graph  # noqa: E402

DB = str(ROOT / "data" / "otentiks.db")
DATASET = json.loads((ROOT / "data" / "eval_dataset.json").read_text())["items"]
PHOENIX_ENDPOINT = "http://localhost:6006/v1/traces"
DEMO_IDS = ["q01", "q05", "q07", "q08", "q12"]


class ReplayLLM:
    """No-key model returning gold SQL with simulated latency; fails q01 once."""

    def __init__(self, seed=7):
        self.rng = random.Random(seed)
        self._seen: set[str] = set()
        self.last_tokens = (0, 0)

    def invoke(self, prompt: str):
        time.sleep(self.rng.uniform(0.35, 0.95))
        qline = next((l for l in prompt.splitlines() if l.startswith("Question:")), "")
        q = qline.replace("Question:", "").strip()
        item = next((it for it in DATASET if it["question"] == q), None)
        gold = item["gold_sql"] if item else "SELECT 1"
        is_corr = "Engine error" in prompt or "fix it" in prompt.lower()
        broken = item and item["id"] == DEMO_IDS[0] and not is_corr and item["id"] not in self._seen
        if broken:
            self._seen.add(item["id"]); out = "```sql\nSELECT COUNT(*) FROM otentik\n```"
        else:
            out = f"```sql\n{gold}\n```"
        self.last_tokens = (max(1, len(prompt) // 4), max(1, len(out) // 4))
        return out


def make_tracer(console: bool):
    provider = TracerProvider(resource=Resource.create({"service.name": "otentik-sql-agent"}))
    if console:
        provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))
    else:
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=PHOENIX_ENDPOINT)))
    trace.set_tracer_provider(provider)
    return trace.get_tracer("nemo_sql_agent"), provider


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--console", action="store_true", help="print spans instead of sending to Phoenix")
    args = ap.parse_args()

    tracer, provider = make_tracer(args.console)
    llm = ReplayLLM()
    cfg = AgentConfig(db_path=DB, use_schema_linking=True, use_cot=True,
                      num_few_shot=3, max_corrections=2, self_consistency_n=1)
    graph = build_sql_agent_graph(llm, cfg)
    gold = {it["id"]: it for it in DATASET}

    for qid in DEMO_IDS:
        q = gold[qid]["question"]
        # one parent span per question; one child span per node (OpenInference-friendly)
        with tracer.start_as_current_span(f"sql_agent:{qid}") as parent:
            parent.set_attribute("openinference.span.kind", "CHAIN")
            parent.set_attribute("input.value", q)
            final = {}
            for update in graph.stream({"question": q}, stream_mode="updates"):
                for node, state in update.items():
                    with tracer.start_as_current_span(node) as sp:
                        kind = "LLM" if node in ("generate", "correct") else "TOOL"
                        sp.set_attribute("openinference.span.kind", kind)
                        if node in ("generate", "correct"):
                            sp.set_attribute("llm.token_count.prompt", llm.last_tokens[0])
                            sp.set_attribute("llm.token_count.completion", llm.last_tokens[1])
                        if isinstance(state, dict):
                            final.update(state)
                            if state.get("sql"):
                                sp.set_attribute("sql", state["sql"])
                            if state.get("result") is not None:
                                sp.set_attribute("execute.ok", bool(state["result"].ok))
                                if state["result"].error:
                                    sp.set_attribute("execute.error", state["result"].error)
            ok = bool(final.get("result") and final["result"].ok)
            parent.set_attribute("output.value", final.get("sql", ""))
            parent.set_attribute("correct", ok)
            print(f"  traced {qid}: {'OK' if ok else 'WRONG'} — {q[:60]}")

    provider.force_flush(); provider.shutdown()
    if args.console:
        print("\nConsole spans printed above. Use without --console to stream into Phoenix at",
              PHOENIX_ENDPOINT)
    else:
        print(f"\nSent traces to Phoenix at {PHOENIX_ENDPOINT}")
        print("Open http://localhost:6006 -> project 'otentik-sql-agent' to view the waterfalls.")


if __name__ == "__main__":
    main()
