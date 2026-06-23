"""A self-improvement flywheel for the text-to-SQL agent.

This is the "agent that improves itself" loop. It does NOT touch model weights;
it improves the agent the cheapest way that compounds: every time the agent
produces a query that is *execution-verified* against the gold result, that
(question, SQL) pair is promoted into the few-shot bank. Future, similar
questions then retrieve a worked example, which is the single highest-ROI,
lowest-cost lever available at inference time.

This mirrors the toolkit's data-flywheel idea (collect good traces -> feed them
back) but stays inside the prompt, so it works without fine-tuning. Each round:

    evaluate -> harvest verified pairs -> grow the example bank -> re-evaluate

Requires a real LLM (and `langgraph`). With no LLM available, use
`simulate.py` instead to produce the illustrative compounding curve.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .db import safe_execute
from .eval import EvalItem, evaluate, load_dataset
from .examples import FEWSHOT_BANK
from .graph import AgentConfig, build_sql_agent_graph


@dataclass
class RoundResult:
    round: int
    execution_accuracy: float
    bank_size: int
    newly_verified: int


def _verified_pairs(llm: Any, cfg: AgentConfig, dataset: list[EvalItem]) -> list[dict]:
    """Run the agent and keep only predictions that match the gold result."""
    graph = build_sql_agent_graph(llm, cfg)
    pairs = []
    for item in dataset:
        state = graph.invoke({"question": item.question})
        pred = state.get("sql", "")
        p = safe_execute(pred, cfg.db_path) if cfg.db_path else safe_execute(pred)
        g = safe_execute(item.gold_sql, cfg.db_path) if cfg.db_path else safe_execute(item.gold_sql)
        if p.ok and g.ok and p.fingerprint() == g.fingerprint():
            pairs.append({"question": item.question, "sql": pred})
    return pairs


def run_flywheel(
    llm: Any,
    config: AgentConfig | None = None,
    rounds: int = 3,
    train: list[EvalItem] | None = None,
    test: list[EvalItem] | None = None,
) -> list[RoundResult]:
    """Iteratively harvest verified pairs from `train` and measure `test` lift.

    Using disjoint train/test splits keeps the measurement honest: we never
    add a test question's own answer to the bank.
    """
    cfg = config or AgentConfig()
    full = load_dataset()
    if train is None or test is None:
        # deterministic split: even-indexed -> train (mine examples), odd -> test
        train = [it for i, it in enumerate(full) if i % 2 == 0]
        test = [it for i, it in enumerate(full) if i % 2 == 1]

    bank = list(FEWSHOT_BANK)
    results: list[RoundResult] = []

    # patch the module-level bank so graph.select_examples sees growth
    import nemo_sql_agent.examples as ex_mod

    for r in range(rounds):
        ex_mod.FEWSHOT_BANK = bank
        test_res = evaluate(llm, cfg, test, cfg.db_path)
        new_pairs = _verified_pairs(llm, cfg, train)
        seen = {(b["question"]) for b in bank}
        added = [p for p in new_pairs if p["question"] not in seen]
        bank = bank + added
        results.append(
            RoundResult(
                round=r,
                execution_accuracy=round(test_res["execution_accuracy"], 4),
                bank_size=len(bank),
                newly_verified=len(added),
            )
        )
    ex_mod.FEWSHOT_BANK = list(FEWSHOT_BANK)  # restore
    return results
