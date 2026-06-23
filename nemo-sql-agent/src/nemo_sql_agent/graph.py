"""A self-correcting text-to-SQL agent built as a LangGraph state machine.

The graph is deliberately built from independently toggleable stages so the
same code can be run as a weak baseline or a strong pipeline. That is what
makes the accompanying ablation/eval study meaningful: every technique in the
educational guide maps to a flag here.

Pipeline (each stage gated by `AgentConfig`):

    link_schema  ->  select_examples  ->  generate  ->  execute
                                              ^             |
                                              |   (error / empty)
                                              +---- correct -+
                                                            |
                                                          vote  ->  END
                                                  (self-consistency)

The LLM is any LangChain `Runnable` (chat model) passed in, so the graph works
with an NVIDIA NIM model, OpenAI, or a local model — and with the NeMo Agent
Toolkit, which injects its configured LLM via the builder.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable, Optional, TypedDict

from .db import ExecResult, render_m_schema, safe_execute
from .examples import FEWSHOT_BANK, select_examples
from .schema_linking import link_schema


@dataclass
class AgentConfig:
    """Feature flags. Flip these to reproduce the ablation table in the guide."""

    use_schema_linking: bool = True
    num_few_shot: int = 3          # 0 disables few-shot
    use_cot: bool = True           # ask for reasoning before the SQL
    max_corrections: int = 2       # self-debug loop iterations (0 disables)
    self_consistency_n: int = 1    # samples to draw; >1 enables majority vote
    db_path: Optional[str] = None

    @classmethod
    def baseline(cls, **kw: Any) -> "AgentConfig":
        """Weakest config (no techniques); pass keywords to turn ones back on."""
        defaults = dict(
            use_schema_linking=False,
            num_few_shot=0,
            use_cot=False,
            max_corrections=0,
            self_consistency_n=1,
        )
        defaults.update(kw)
        return cls(**defaults)


class SQLAgentState(TypedDict, total=False):
    question: str
    schema: str
    examples: str
    candidates: list[str]          # SQL candidates for self-consistency
    sql: str                       # current working SQL
    result: ExecResult
    attempts: int
    history: list[dict]            # per-step trace, also handy for LangSmith


_SQL_FENCE = re.compile(r"```(?:sql)?\s*(.*?)```", re.IGNORECASE | re.DOTALL)


def _extract_sql(text: str) -> str:
    m = _SQL_FENCE.search(text)
    sql = (m.group(1) if m else text).strip()
    # keep only from the first SELECT/WITH onward
    m2 = re.search(r"\b(SELECT|WITH)\b", sql, re.IGNORECASE)
    if m2:
        sql = sql[m2.start():]
    return sql.strip().rstrip(";").strip()


def _llm_text(llm: Any, prompt: str) -> str:
    """Call a LangChain chat model (or any object with .invoke) and get text."""
    out = llm.invoke(prompt)
    return getattr(out, "content", out) if not isinstance(out, str) else out


def build_sql_agent_graph(
    llm: Any,
    config: AgentConfig | None = None,
) -> Any:
    """Compile and return the LangGraph agent. Requires `langgraph` installed."""
    from langgraph.graph import END, StateGraph

    cfg = config or AgentConfig()
    db_path = cfg.db_path

    def link_schema_node(state: SQLAgentState) -> SQLAgentState:
        full = render_m_schema(db_path) if db_path else render_m_schema()
        schema = link_schema(state["question"], full) if cfg.use_schema_linking else full
        return {"schema": schema, "attempts": 0, "history": [{"step": "link_schema"}]}

    def select_examples_node(state: SQLAgentState) -> SQLAgentState:
        if cfg.num_few_shot <= 0:
            return {"examples": ""}
        ex = select_examples(state["question"], FEWSHOT_BANK, k=cfg.num_few_shot)
        return {"examples": ex}

    def _build_prompt(state: SQLAgentState, feedback: str = "") -> str:
        cot = (
            "First think step by step about which tables and joins are needed, "
            "then output the final SQL.\n"
            if cfg.use_cot
            else "Output only the SQL.\n"
        )
        examples = f"\nWorked examples:\n{state.get('examples','')}\n" if state.get("examples") else ""
        fb = f"\nThe previous query failed. Fix it.\n{feedback}\n" if feedback else ""
        return (
            "You are an expert SQLite analyst. Write a single read-only SELECT "
            "query that answers the question using ONLY the schema below.\n\n"
            f"{state['schema']}\n{examples}{fb}\n"
            f"Question: {state['question']}\n\n{cot}"
            "Return the SQL inside a ```sql ... ``` block."
        )

    def generate_node(state: SQLAgentState) -> SQLAgentState:
        n = max(1, cfg.self_consistency_n)
        prompt = _build_prompt(state)
        candidates = [_extract_sql(_llm_text(llm, prompt)) for _ in range(n)]
        hist = state.get("history", []) + [{"step": "generate", "candidates": candidates}]
        return {"candidates": candidates, "sql": candidates[0], "history": hist}

    def execute_node(state: SQLAgentState) -> SQLAgentState:
        res = safe_execute(state["sql"], db_path) if db_path else safe_execute(state["sql"])
        hist = state.get("history", []) + [
            {"step": "execute", "sql": state["sql"], "ok": res.ok, "error": res.error}
        ]
        return {"result": res, "history": hist}

    def correct_node(state: SQLAgentState) -> SQLAgentState:
        feedback = f"SQL:\n{state['sql']}\nEngine error:\n{state['result'].error}"
        prompt = _build_prompt(state, feedback=feedback)
        fixed = _extract_sql(_llm_text(llm, prompt))
        hist = state.get("history", []) + [{"step": "correct", "sql": fixed}]
        return {"sql": fixed, "attempts": state.get("attempts", 0) + 1, "history": hist}

    def should_correct(state: SQLAgentState) -> str:
        res = state["result"]
        if res.ok or state.get("attempts", 0) >= cfg.max_corrections:
            return "vote"
        return "correct"

    def vote_node(state: SQLAgentState) -> SQLAgentState:
        """Majority vote over candidates by execution-result fingerprint."""
        if cfg.self_consistency_n <= 1:
            return {}
        from collections import Counter

        scored: list[tuple[str, str]] = []
        for sql in state.get("candidates", []):
            r = safe_execute(sql, db_path) if db_path else safe_execute(sql)
            if r.ok:
                scored.append((sql, r.fingerprint()))
        if not scored:
            return {}
        winner_fp = Counter(fp for _, fp in scored).most_common(1)[0][0]
        winner_sql = next(sql for sql, fp in scored if fp == winner_fp)
        res = safe_execute(winner_sql, db_path) if db_path else safe_execute(winner_sql)
        hist = state.get("history", []) + [{"step": "vote", "sql": winner_sql, "n": len(scored)}]
        return {"sql": winner_sql, "result": res, "history": hist}

    g = StateGraph(SQLAgentState)
    g.add_node("link_schema", link_schema_node)
    g.add_node("select_examples", select_examples_node)
    g.add_node("generate", generate_node)
    g.add_node("execute", execute_node)
    g.add_node("correct", correct_node)
    g.add_node("vote", vote_node)

    g.set_entry_point("link_schema")
    g.add_edge("link_schema", "select_examples")
    g.add_edge("select_examples", "generate")
    g.add_edge("generate", "execute")
    g.add_conditional_edges("execute", should_correct, {"correct": "correct", "vote": "vote"})
    g.add_edge("correct", "execute")
    g.add_edge("vote", END)
    return g.compile()


def answer_question(llm: Any, question: str, config: AgentConfig | None = None) -> SQLAgentState:
    """Convenience: run the graph end to end for one question."""
    graph = build_sql_agent_graph(llm, config)
    return graph.invoke({"question": question})
