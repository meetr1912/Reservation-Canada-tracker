"""Few-shot example bank + similarity-based example selection.

Two findings from the text-to-SQL literature shape this module:
  * In-context demonstrations help, but *which* examples you show matters more
    than how many — examples retrieved by similarity to the question beat a
    fixed/random set, and beyond a handful, more examples give diminishing or
    negative returns.
  * So the bank is small and selection is similarity-based (token overlap here;
    swap in embeddings for production). The self-improvement loop GROWS this
    bank with verified (question, SQL) pairs — that is the compounding lever.
"""
from __future__ import annotations

import re

_WORD = re.compile(r"[a-z0-9]+")

# Seed bank. Kept intentionally small; self_improve.py appends verified pairs.
FEWSHOT_BANK: list[dict[str, str]] = [
    {
        "question": "How many oTENTik units are there in total?",
        "sql": "SELECT COUNT(*) FROM otentiks;",
    },
    {
        "question": "List the distinct provinces that have oTENTiks.",
        "sql": "SELECT DISTINCT province FROM parks ORDER BY province;",
    },
    {
        "question": "How many oTENTik units does Fundy National Park have?",
        "sql": "SELECT COUNT(*) FROM otentiks o JOIN parks p ON o.park_id = p.park_id "
               "WHERE p.park_group = 'Fundy National Park';",
    },
    {
        "question": "How many oTENTiks are available on a given date?",
        "sql": "SELECT COUNT(*) FROM availability WHERE date = '2026-07-01' AND is_available = 1;",
    },
    {
        "question": "For each province, how many oTENTik-nights are available in total?",
        "sql": "SELECT p.province, SUM(a.is_available) AS nights "
               "FROM availability a JOIN otentiks o ON a.resource_id = o.resource_id "
               "JOIN parks p ON o.park_id = p.park_id GROUP BY p.province ORDER BY nights DESC;",
    },
]


def _tokens(text: str) -> set[str]:
    return set(_WORD.findall(text.lower()))


def _similarity(a: str, b: str) -> float:
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)  # Jaccard


def select_examples(question: str, bank: list[dict[str, str]], k: int = 3) -> str:
    """Pick the k most similar examples and render them for the prompt."""
    ranked = sorted(bank, key=lambda ex: _similarity(question, ex["question"]), reverse=True)
    chosen = ranked[: max(0, k)]
    return "\n".join(f"-- {ex['question']}\n{ex['sql']}" for ex in chosen)
