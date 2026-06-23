"""Lightweight, deterministic schema linking.

Schema linking trims the schema shown to the model down to the tables and
columns a question is likely to need. On large databases this is one of the
highest-leverage techniques (it removes distractor columns and frees up the
context budget). Here the DB is tiny, so this is a faithful, dependency-free
illustration of the technique rather than a production retriever — swap in an
embedding retriever for real workloads.

Strategy: score each table by token overlap between the question and the
table's name + column names + sample values; always keep tables on a join path
to a kept table (via foreign keys) so joins never break.
"""
from __future__ import annotations

import re

_WORD = re.compile(r"[a-z0-9]+")
_STOP = {
    "the", "a", "an", "of", "in", "on", "for", "to", "and", "or", "how",
    "many", "what", "which", "list", "show", "give", "are", "is", "with",
    "all", "each", "that", "have", "has", "at", "by", "per", "total",
}


def _tokens(text: str) -> set[str]:
    return {w for w in _WORD.findall(text.lower()) if w not in _STOP and len(w) > 1}


def _parse_tables(m_schema: str) -> list[tuple[str, str, set[str]]]:
    """Return [(table_name, block_text, token_set), ...] from an M-Schema string."""
    blocks: list[tuple[str, str, set[str]]] = []
    current_name = None
    current_lines: list[str] = []
    for line in m_schema.splitlines():
        if line.startswith("# Table:"):
            if current_name is not None:
                block = "\n".join(current_lines)
                blocks.append((current_name, block, _tokens(block)))
            current_name = line.split(":", 1)[1].strip()
            current_lines = [line]
        elif current_name is not None:
            current_lines.append(line)
    if current_name is not None:
        block = "\n".join(current_lines)
        blocks.append((current_name, block, _tokens(block)))
    return blocks


def link_schema(question: str, m_schema: str, min_keep: int = 1) -> str:
    """Return a reduced M-Schema containing only question-relevant tables."""
    header_end = m_schema.find("# Table:")
    header = m_schema[:header_end] if header_end > 0 else ""
    blocks = _parse_tables(m_schema)
    if not blocks:
        return m_schema

    q = _tokens(question)
    scored = [(name, block, len(q & toks)) for name, block, toks in blocks]
    kept = {name for name, _, score in scored if score > 0}

    # If nothing matched, keep everything (never strip the agent blind).
    if len(kept) < min_keep:
        return m_schema

    # Keep any table referenced by a FK from a kept table (preserve join paths).
    name_to_block = {name: block for name, block, _ in scored}
    fk_re = re.compile(r"FK->(\w+)\.")
    changed = True
    while changed:
        changed = False
        for name in list(kept):
            for ref in fk_re.findall(name_to_block.get(name, "")):
                if ref not in kept and ref in name_to_block:
                    kept.add(ref)
                    changed = True
        # also pull in tables that FK *into* a kept table
        for name, block, _ in scored:
            if name in kept:
                continue
            if any(ref in kept for ref in fk_re.findall(block)):
                kept.add(name)
                changed = True

    ordered = [block for name, block, _ in scored if name in kept]
    return f"{header}{chr(10).join(ordered)}"
