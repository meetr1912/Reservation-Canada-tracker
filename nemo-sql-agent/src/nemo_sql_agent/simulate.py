"""Offline, literature-calibrated simulation of the improvement ladder.

WHAT THIS IS: a deterministic model that reproduces the *shape* of text-to-SQL
improvement — the marginal gain of each technique and the saturation/negative
returns when you over-stack — using effect sizes drawn from published BIRD/Spider
results. It needs no API key, so it powers `docs/visualization.html` and lets
anyone see the compounding-returns story without running an LLM.

WHAT THIS IS NOT: a measurement of this repo's database. The real, honest
numbers come from `eval.run_ablation` / `self_improve.run_flywheel` with a live
model. Treat the curve here as illustrative, calibrated to the citations in
docs/GUIDE.md (CHESS 2405.16755, MAC-SQL 2312.11242, CHASE-SQL 2410.01943,
DAIL-SQL 2308.15363, "Death of Schema Linking?" 2408.07702).
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass

# Per-technique marginal EX deltas (in points), with the diminishing-returns
# damping that each subsequent technique sees as the base rises. Values are the
# midpoints of the ranges reported in the guide's sources.
LADDER = [
    {"stage": "Base model, raw DDL schema", "base": 46.0, "delta": 0.0,
     "note": "Vanilla GPT-4-class on BIRD dev ~ mid-40s EX.", "cite": "2312.11242"},
    {"stage": "+ M-Schema + high-recall schema linking", "delta": 6.1,
     "note": "CHESS table selection +6.12; keep recall high, don't over-prune.", "cite": "2405.16755 / 2408.07702"},
    {"stage": "+ Query-plan style chain-of-thought", "delta": 4.0,
     "note": "Structured/QP CoT helps; naive short CoT ~0.", "cite": "2410.01943 / 2505.14174"},
    {"stage": "+ Similarity few-shot (k≈3)", "delta": 3.0,
     "note": "Skeleton/masked-question retrieval; gain on EX modest, peaks ~3.", "cite": "2308.15363"},
    {"stage": "+ Execution-grounded self-correction", "delta": 4.6,
     "note": "MAC-SQL Refiner: −4.63 EX when removed. Highest single lever.", "cite": "2312.11242 / 2304.05128"},
    {"stage": "+ Multi-candidate + trained selector", "delta": 6.0,
     "note": "~+6 over naive voting; oracle ceiling still ~10 pts higher.", "cite": "2410.01943"},
    {"stage": "+ More few-shot (k=8) [over-stacking]", "delta": -2.2,
     "note": "Beyond ~3 examples EX declines; negative return.", "cite": "2502.14913"},
]


@dataclass
class LadderPoint:
    stage: str
    execution_accuracy: float
    marginal_delta: float
    cumulative_delta: float
    note: str
    cite: str


def simulate_ladder(damping: float = 0.85) -> list[LadderPoint]:
    """Apply each delta with diminishing returns; negative deltas apply in full."""
    points: list[LadderPoint] = []
    acc = LADDER[0]["base"]
    start = acc
    for i, step in enumerate(LADDER):
        raw = step.get("delta", 0.0)
        # diminishing returns on positive gains as more techniques stack
        applied = raw if raw <= 0 else raw * (damping ** max(0, i - 1))
        acc = round(acc + applied, 2)
        points.append(
            LadderPoint(
                stage=step["stage"],
                execution_accuracy=acc,
                marginal_delta=round(applied, 2),
                cumulative_delta=round(acc - start, 2),
                note=step["note"],
                cite=step["cite"],
            )
        )
    return points


def to_json(damping: float = 0.85) -> str:
    return json.dumps([asdict(p) for p in simulate_ladder(damping)], indent=2)


if __name__ == "__main__":
    for p in simulate_ladder():
        sign = "+" if p.marginal_delta >= 0 else ""
        print(f"{p.execution_accuracy:5.1f} EX  ({sign}{p.marginal_delta:>4})  {p.stage}")
