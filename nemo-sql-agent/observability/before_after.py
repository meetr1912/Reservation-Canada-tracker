"""Before/after comparison: a WEAK baseline config vs the TUNED pipeline.

Runs the real LangGraph agent twice over the eval dataset with a no-key replay
model whose *ability scales with the techniques that are switched on* — a small,
clearly-labeled simulation calibrated to the directions in ../docs/GUIDE.md
(schema linking and few-shot are the biggest levers; correction recovers some
misses; CoT is a small help). It then reports, for each config: how many
easy/medium/hard questions are solved, execution accuracy, average latency, and
average tokens per question — i.e. the accuracy↔cost trade-off you tune.

Run:  cd nemo-sql-agent && PYTHONPATH=src python observability/before_after.py
"""
from __future__ import annotations

import json
import random
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from nemo_sql_agent.db import safe_execute  # noqa: E402
from nemo_sql_agent.graph import AgentConfig, build_sql_agent_graph  # noqa: E402

DB = str(ROOT / "data" / "otentiks.db")
DATASET = json.loads((ROOT / "data" / "eval_dataset.json").read_text())["items"]

# capability model (illustrative; calibrated to GUIDE.md directions)
BASE_CAP = 0.8
W = {"schema": 1.0, "cot": 0.4, "few_shot": 1.0, "correct": 0.5}
DIFF = {"easy": 0.5, "medium": 1.6, "hard": 2.6}
# a wrong-but-runnable query so misses count as wrong (not as crashes)
WRONG_SQL = "SELECT COUNT(*) FROM otentiks WHERE 1=0"


def capability(cfg: AgentConfig) -> float:
    cap = BASE_CAP
    if cfg.use_schema_linking: cap += W["schema"]
    if cfg.use_cot: cap += W["cot"]
    if cfg.num_few_shot > 0: cap += W["few_shot"]
    if cfg.max_corrections > 0: cap += W["correct"]
    return cap


class AbilityLLM:
    """Returns gold SQL when capability clears the question's difficulty, else a
    wrong (but runnable) query. Simulated latency; tokens grow with prompt size."""

    def __init__(self, cfg: AgentConfig, seed=11):
        self.cap = capability(cfg)
        self.rng = random.Random(seed)
        self.tokens = 0

    def invoke(self, prompt: str):
        time.sleep(self.rng.uniform(0.3, 0.8))
        self.tokens += max(1, len(prompt) // 4)
        qline = next((l for l in prompt.splitlines() if l.startswith("Question:")), "")
        q = qline.replace("Question:", "").strip()
        item = next((it for it in DATASET if it["question"] == q), None)
        if not item:
            return "```sql\nSELECT 1\n```"
        solved = self.cap >= DIFF.get(item["difficulty"], 1.6)
        sql = item["gold_sql"] if solved else WRONG_SQL
        return f"```sql\n{sql}\n```"


def run_config(name: str, cfg: AgentConfig) -> dict:
    llm = AbilityLLM(cfg)
    graph = build_sql_agent_graph(llm, cfg)
    by_diff = {"easy": [0, 0], "medium": [0, 0], "hard": [0, 0]}  # [correct,total]
    correct = 0
    t0 = time.perf_counter()
    for it in DATASET:
        state = graph.invoke({"question": it["question"]})
        pred = state.get("sql", "")
        p = safe_execute(pred, DB); g = safe_execute(it["gold_sql"], DB)
        ok = p.ok and g.ok and p.fingerprint() == g.fingerprint()
        by_diff[it["difficulty"]][1] += 1
        by_diff[it["difficulty"]][0] += int(ok)
        correct += int(ok)
    elapsed = time.perf_counter() - t0
    return {
        "name": name,
        "execution_accuracy": round(correct / len(DATASET), 3),
        "by_difficulty": {k: {"correct": v[0], "total": v[1]} for k, v in by_diff.items()},
        "avg_latency_s": round(elapsed / len(DATASET), 3),
        "avg_tokens": round(llm.tokens / len(DATASET), 1),
        "config": {"schema_linking": cfg.use_schema_linking, "cot": cfg.use_cot,
                   "few_shot": cfg.num_few_shot, "max_corrections": cfg.max_corrections},
    }


def main():
    before = run_config("baseline (no techniques)", AgentConfig.baseline(db_path=DB))
    after = run_config("tuned pipeline", AgentConfig(
        db_path=DB, use_schema_linking=True, use_cot=True, num_few_shot=3,
        max_corrections=2, self_consistency_n=1))
    out = {"before": before, "after": after,
           "note": "Illustrative: the replay model's ability scales with techniques, "
                   "calibrated to GUIDE.md directions. Real magnitudes: see GUIDE.md (BIRD/Spider)."}
    print(json.dumps(out, indent=2))
    (Path(__file__).resolve().parent / "out").mkdir(exist_ok=True)
    (Path(__file__).resolve().parent / "out" / "before_after.json").write_text(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
