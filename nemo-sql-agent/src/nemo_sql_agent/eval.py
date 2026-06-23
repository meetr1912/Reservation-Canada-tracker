"""Execution-accuracy evaluation and ablation harness.

Execution accuracy (EX) is the standard text-to-SQL metric: a prediction is
correct if running it yields the same result set as the gold query. We compare
order-insensitive fingerprints so a correct query with different row order
still counts (matching how BIRD/Spider score set-semantics queries).

`run_ablation` runs the SAME questions under a ladder of `AgentConfig`s so you
can see how much each technique adds — the empirical version of the guide's
"what works / what doesn't / compounding returns" story.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .db import safe_execute
from .graph import AgentConfig, build_sql_agent_graph

DATA = Path(__file__).resolve().parents[2] / "data"


@dataclass
class EvalItem:
    id: str
    question: str
    gold_sql: str
    difficulty: str = "?"


def load_dataset(path: str | Path = DATA / "eval_dataset.json") -> list[EvalItem]:
    raw = json.loads(Path(path).read_text())
    return [
        EvalItem(it["id"], it["question"], it["gold_sql"], it.get("difficulty", "?"))
        for it in raw["items"]
    ]


def _matches_gold(pred_sql: str, gold_sql: str, db_path: str | None) -> bool:
    pred = safe_execute(pred_sql, db_path) if db_path else safe_execute(pred_sql)
    gold = safe_execute(gold_sql, db_path) if db_path else safe_execute(gold_sql)
    if not gold.ok:  # bad gold = bad dataset; surface loudly
        raise ValueError(f"Gold query failed: {gold.error}\n{gold_sql}")
    return pred.ok and pred.fingerprint() == gold.fingerprint()


def evaluate(
    llm: Any,
    config: AgentConfig,
    dataset: list[EvalItem] | None = None,
    db_path: str | None = None,
) -> dict[str, Any]:
    """Run the agent over the dataset and return execution accuracy + per-item."""
    dataset = dataset or load_dataset()
    graph = build_sql_agent_graph(llm, config)
    per_item, correct = [], 0
    for item in dataset:
        state = graph.invoke({"question": item.question})
        pred_sql = state.get("sql", "")
        ok = False
        try:
            ok = _matches_gold(pred_sql, item.gold_sql, db_path)
        except ValueError:
            raise
        except Exception:
            ok = False
        correct += int(ok)
        per_item.append(
            {"id": item.id, "difficulty": item.difficulty, "correct": ok, "pred_sql": pred_sql}
        )
    return {
        "execution_accuracy": correct / len(dataset) if dataset else 0.0,
        "correct": correct,
        "total": len(dataset),
        "per_item": per_item,
    }


# An ablation ladder: each rung turns on one more proven technique.
ABLATION_LADDER: list[tuple[str, AgentConfig]] = [
    ("baseline (raw schema, no tricks)", AgentConfig.baseline()),
    ("+ M-Schema + schema linking", AgentConfig.baseline(use_schema_linking=True)),
    ("+ chain-of-thought", AgentConfig.baseline(use_schema_linking=True, use_cot=True)),
    ("+ few-shot (k=3, similarity)", AgentConfig.baseline(use_schema_linking=True, use_cot=True, num_few_shot=3)),
    ("+ self-correction (execution feedback)", AgentConfig(use_schema_linking=True, use_cot=True, num_few_shot=3, max_corrections=2, self_consistency_n=1)),
    ("+ self-consistency (n=5)", AgentConfig(use_schema_linking=True, use_cot=True, num_few_shot=3, max_corrections=2, self_consistency_n=5)),
]


def run_ablation(
    llm: Any,
    dataset: list[EvalItem] | None = None,
    db_path: str | None = None,
) -> list[dict[str, Any]]:
    dataset = dataset or load_dataset()
    rows = []
    prev = None
    for label, cfg in ABLATION_LADDER:
        res = evaluate(llm, cfg, dataset, db_path)
        ex = res["execution_accuracy"]
        rows.append(
            {
                "stage": label,
                "execution_accuracy": round(ex, 4),
                "delta": round(ex - prev, 4) if prev is not None else None,
            }
        )
        prev = ex
    return rows
