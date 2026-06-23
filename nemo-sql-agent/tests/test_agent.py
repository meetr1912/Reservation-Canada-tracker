"""Tests for the text-to-SQL agent.

Run:  cd nemo-sql-agent && PYTHONPATH=src python -m pytest tests/ -q
(or just `python tests/test_agent.py` for a quick check)

A `StubLLM` stands in for a real model so the graph, self-correction loop, and
self-consistency vote can be exercised deterministically with no API key. It
also fakes a first-attempt error to prove the self-correction edge fires.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from nemo_sql_agent.db import render_m_schema, safe_execute  # noqa: E402
from nemo_sql_agent.examples import FEWSHOT_BANK, select_examples  # noqa: E402
from nemo_sql_agent.schema_linking import link_schema  # noqa: E402
from nemo_sql_agent.simulate import simulate_ladder  # noqa: E402

DB = str(ROOT / "data" / "otentiks.db")


class StubLLM:
    """Returns canned SQL. First call for a question returns a broken query so
    the execution-grounded self-correction path is exercised."""

    def __init__(self):
        self.seen: set[str] = set()

    def invoke(self, prompt: str):
        # The correction prompt includes "Engine error"; return valid SQL then.
        broken = "Engine error" not in prompt and "fix it" not in prompt.lower()
        first = id(prompt) not in self.seen
        self.seen.add(id(prompt))
        if "how many oTENTik units are there in total" in prompt.lower():
            if broken and first:
                return "```sql\nSELECT COUNT(*) FROM otentik\n```"  # wrong table
            return "```sql\nSELECT COUNT(*) FROM otentiks\n```"
        return "```sql\nSELECT COUNT(*) FROM otentiks\n```"


def test_db_and_gold_queries():
    assert safe_execute("SELECT COUNT(*) FROM otentiks", DB).rows[0][0] == 122
    bad = safe_execute("DROP TABLE parks", DB)
    assert not bad.ok  # write blocked


def test_schema_and_examples():
    full = render_m_schema(DB)
    assert "# Table: parks" in full and "examples:" in full
    linked = link_schema("provinces with oTENTiks", full)
    assert "# Table: parks" in linked
    ex = select_examples("how many units in Fundy?", FEWSHOT_BANK, k=2)
    assert "Fundy" in ex


def test_graph_self_correction():
    from nemo_sql_agent.graph import AgentConfig, build_sql_agent_graph

    cfg = AgentConfig(db_path=DB, max_corrections=2, self_consistency_n=1)
    graph = build_sql_agent_graph(StubLLM(), cfg)
    state = graph.invoke({"question": "How many oTENTik units are there in total?"})
    assert state["result"].ok
    assert state["result"].rows[0][0] == 122
    # the trace should show at least one execute step
    steps = [h["step"] for h in state["history"]]
    assert "execute" in steps


def test_simulation_shape():
    pts = simulate_ladder()
    assert pts[0].execution_accuracy < pts[-2].execution_accuracy  # techniques help
    assert pts[-1].marginal_delta < 0  # over-stacking hurts


if __name__ == "__main__":
    test_db_and_gold_queries()
    test_schema_and_examples()
    test_graph_self_correction()
    test_simulation_shape()
    print("all tests passed")
