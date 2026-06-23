# How to Improve an Agent That Writes SQL — End to End with the NeMo Agent Toolkit

This is an evidence-based playbook for taking a text-to-SQL agent from "writes
plausible SQL" to "writes correct SQL, measurably, and keeps getting better."
It is grounded in published BIRD/Spider results (every claim is cited) and wired
to a runnable example in this repo: a self-correcting LangGraph agent that
queries the Parks Canada oTENTik availability database, instrumented with
LangSmith and driven by NVIDIA's **NeMo Agent Toolkit** (`nvidia-nat`).

> **Metric.** Everything below uses **execution accuracy (EX)**: a query is
> correct if running it returns the same result set as the gold query. EX is
> the only metric that matches what users care about, and it is what the
> example's evaluator (`sql_execution_accuracy`) and `eval.run_ablation`
> compute. Exact-string match (EM) is reported only where a source used it.

---

## TL;DR — the priority order that pays off

Stack these in order; each line cites the strongest evidence and the example's
switch that turns it on. Returns **diminish** as you go down, and the last item
shows where they go **negative**.

| # | Technique | Proven effect | Example switch |
|---|-----------|---------------|----------------|
| 1 | Strong base model + fit schema in context (high-recall linking, don't over-prune) | +4 to +6 EX at scale; can be **negative** on small schemas / long-context models | `use_schema_linking`, M-Schema in `db.py` |
| 2 | Execution-grounded self-correction | +3 to +5 EX; the single biggest single-component drop when removed (−4.63) | `max_corrections` |
| 3 | Multi-candidate + a good (trained/execution-based) selector | ~+6 over naive voting; ~10-pt oracle gap remains | `self_consistency_n` |
| 4 | Similarity few-shot, ~3 examples | +3 to +11 vs zero-shot; **peaks at ~3**, then declines | `num_few_shot` |
| 5 | Value/entity RAG + rich schema representation (M-Schema) | grounds NL terms to real cell values | `render_m_schema` |
| 6 | Fine-tune a small model (optional) | can match frontier pipelines at lower per-query cost; **don't then add few-shot** | `nat finetune` |

The rest of this document is the "why," with numbers.

---

## 1. Know your benchmark — and why "solved on Spider" is a trap

| Benchmark | Scale | SOTA EX | Human | Why it matters |
|---|---|---|---|---|
| **Spider 1.0** | 10k Q / 200 DBs | ~91.2% | — | Effectively saturated/retired; small clean academic DBs |
| **BIRD** | 12.7k Q / 95 DBs / 33 GB | ~80–82% | **92.96%** | Dirty real values, large DBs, needs domain "evidence", scores efficiency (VES) |
| **Spider 2.0** | enterprise workflows | ~31% (and contested) | — | >1,000-column schemas, multiple dialects, multi-step — closest to production |

- Spider 1.0 EX rose from 53.5% (2020) to 91.2% and stopped taking submissions in 2024 — it no longer discriminates between good systems. [Spider](https://yale-lily.github.io/spider), [MiniSeek](https://www.seek.ai/blog/miniseek-first-model-to-surpass-90-accuracy-on-spider-test-benchmark)
- **BIRD** still trails its **92.96% human baseline** by ~11–13 points at ~80–82% EX; the original GPT-4 baseline was ~54.89%. [bird-bench.github.io](https://bird-bench.github.io/), [BIRD paper 2305.03111](https://arxiv.org/abs/2305.03111)
- **Spider 2.0** is the reality check: GPT-4o solves ~10%, o1-preview ~17%, and DAIL-SQL+GPT-4o on Spider 2.0-Lite just **5.68%**. A pipeline that looks finished on Spider 1.0 can be near-useless on enterprise schemas. [Spider 2.0, 2411.07763](https://arxiv.org/abs/2411.07763)
- **Caveat on EX itself:** the FLEX study found BIRD's EX agrees with expert human judgment only ~62% of the time (many false negatives from acceptable alternative queries), so reported EX can *understate* true correctness. Build a few-example eyeball check into your loop. [FLEX, NAACL 2025](https://aclanthology.org/2025.naacl-long.228.pdf)

**Takeaway:** pick the benchmark that resembles *your* database. For this repo's
3-table schema, even a small model does well; for a 1,000-column warehouse,
expect Spider-2.0-like difficulty and prioritize schema handling.

---

## 2. Schema linking — essential at scale, harmful when overdone

**What it is:** show the model only the tables/columns a question needs.

**Evidence it helps (large/weak settings):**
- DIN-SQL ablation: removing schema linking dropped EX **69.9% → 65.9%** (−4.0). [DIN-SQL 2304.11015](https://arxiv.org/abs/2304.11015)
- CHESS: table selection alone worth **+6.12% EX** on BIRD; value retrieval +4.76%. [CHESS 2405.16755](https://arxiv.org/abs/2405.16755)
- RESDSQL's cross-encoder schema ranking underpinned its 84.1% Spider dev. [RESDSQL 2302.05965](https://arxiv.org/abs/2302.05965)

**Evidence it can hurt:**
- "The Death of Schema Linking?": with GPT-4o holding the *full* BIRD schema, **skipping** schema linking reached **71.83% EX** (rank-1 at submission). Imperfect filtering drops needed columns; as models get better at long context, the benefit shrinks and can go negative. [2408.07702](https://arxiv.org/abs/2408.07702)
- The failure mode is **recall**: missing one needed column is catastrophic. RSL-SQL targets ~94% column recall → 67.21% BIRD EX. [RSL-SQL 2411.00073](https://arxiv.org/abs/2411.00073)

**Rule of thumb:** if the schema fits in context, prefer a **high-recall**
selector (or none); only prune aggressively when the schema can't fit. In this
example, `schema_linking.link_schema` keeps every table on a foreign-key join
path so it never breaks joins — and on the tiny oTENTik schema it correctly
keeps all three tables, illustrating that linking is a *scale* technique.

---

## 3. Self-correction with execution feedback — the highest-ROI single lever

**What it is:** run the generated SQL, feed the engine's error (or empty/odd
result) back, and let the model revise.

- **MAC-SQL Refiner** is the cleanest ablation: removing the execution-grounded refiner drops BIRD dev EX by **−4.63** — larger than removing the decomposer (−3.85) or selector (−2.11). [MAC-SQL 2312.11242](https://arxiv.org/abs/2312.11242)
- **Self-Debugging:** Codex on Spider **81.3% → 84.1%** (+2.8), and **+9%** on the hardest split. With real unit-test execution feedback (not just explanation), gains reach **+12%** — *grounded* feedback beats "rubber-duck" feedback. [Self-Debugging 2304.05128](https://arxiv.org/abs/2304.05128)
- **But blind correction backfires on strong models:** DIN-SQL found a generic "here is buggy SQL, fix it" prompt *helped Codex but hurt GPT-4*, which rarely emits bugs and over-edits. Use a *gentle* prompt and only correct on a real signal (an execution error or empty result), not unconditionally. [DIN-SQL 2304.11015](https://arxiv.org/abs/2304.11015)

In the example, the LangGraph `execute → should_correct → correct` loop only
fires when `safe_execute` reports an error, and is capped by `max_corrections`.
That is the "correct on real signal, bounded" pattern.

---

## 4. Multiple candidates + selection — generation is no longer the bottleneck

- **Naive self-consistency (majority vote)** is nearly free but small: DAIL-SQL Spider test **86.2% → 86.6%** (+0.4); a survey reports ~+0.8% on Spider 1.0. [DAIL-SQL 2308.15363](https://arxiv.org/abs/2308.15363), [survey 2408.05109](https://arxiv.org/abs/2408.05109)
- **Execution-based grouping** (vote on the *result set*, not the SQL string) is much stronger: up to **+6.9%** → 87.6% on Spider 1.0. [2408.05109](https://arxiv.org/abs/2408.05109)
- **A trained selector** is best: CHASE-SQL's fine-tuned pairwise comparator beats self-consistency by **~+6** on BIRD dev → **73.01% EX**. Crucially, its **oracle ceiling is 82.79%** — ~10 points of correct queries are generated but not *selected*. The remaining error is a **selection** problem, not a generation problem. [CHASE-SQL 2410.01943](https://arxiv.org/abs/2410.01943)

The example's `vote` node groups candidates by **execution fingerprint** (the
strong variant), controlled by `self_consistency_n`.

---

## 5. Few-shot examples — yes, but ~3, chosen by similarity

- **Zero → few-shot:** GPT-4 on Spider dev ~**72.3% → 83.5%** (~+11). [DAIL-SQL 2308.15363](https://arxiv.org/abs/2308.15363)
- **Similarity selection beats random:** DAIL-SQL ranks examples by *masked-question* similarity (mask schema-specific tokens) + SQL-skeleton similarity; large on EM (~+20) but more modest on EX (~+3). Masking makes retrieval key on structure, not domain words. [DAIL-SQL 2308.15363](https://arxiv.org/abs/2308.15363)
- **Optimum ≈ 3, then it declines:** beyond ~3 examples EX drops; one report shows 3-shot **−2.2%** vs 1-shot for GPT-3.5. [2502.14913](https://arxiv.org/abs/2502.14913)

The example's `examples.select_examples` does Jaccard-similarity retrieval and
defaults to `k=3`. Its `FEWSHOT_BANK` is what the **self-improvement flywheel
grows** (§8).

---

## 6. Decomposition & chain-of-thought — structured, not naive

| Method | LLM | Spider test | BIRD test |
|---|---|---|---|
| DIN-SQL | GPT-4 | 85.3% | 55.9% |
| DAIL-SQL | GPT-4 | 86.6% | ~57.4% |
| MAC-SQL | GPT-4 | — | 59.59% |
| CHESS | best | — | 66.69% |
| CHASE-SQL | Gemini 1.5 Pro | — | 73.0% |
| XiYan-SQL | ensemble | 89.65% | ~75.6% |

Sources: [DIN-SQL](https://arxiv.org/abs/2304.11015), [DAIL-SQL](https://arxiv.org/abs/2308.15363), [MAC-SQL](https://arxiv.org/abs/2312.11242), [CHESS](https://arxiv.org/abs/2405.16755), [CHASE-SQL](https://arxiv.org/abs/2410.01943), [XiYan-SQL](https://arxiv.org/abs/2411.08599).

- **Naive CoT often does nothing** (e.g., LLaMA-3.1 sees ~0 gain from a plain "think step by step"). What helps is **structured** CoT — CHASE-SQL's **Query-Plan CoT** writes out an engine-style execution plan, which aligns with patterns in pretraining data and beats vanilla CoT. [CHASE-SQL 2410.01943](https://arxiv.org/abs/2410.01943), [2505.14174](https://arxiv.org/abs/2505.14174)

The example's `use_cot` asks for table/join reasoning before the SQL — upgrade
it to query-plan style for harder schemas.

---

## 7. Schema representation & value retrieval (RAG)

- **M-Schema** (XiYan-SQL): a semi-structured schema view with types, keys, and **sample values per column** — richer than raw DDL, and part of the pipeline that hit ~75.6% BIRD / 89.65% Spider test. The example's `render_m_schema` emits this format. [XiYan-SQL 2411.08599](https://arxiv.org/abs/2411.08599)
- **Value/entity retrieval** matters when question words must match literal cell values (e.g., "Fundy" → `park_group = 'Fundy National Park'`). CHESS uses LSH + keyword + vector search; CHASE-SQL has a dedicated value-retrieval step. For production, index distinct column values and inject the matches. [CHESS 2405.16755](https://arxiv.org/abs/2405.16755), [CHASE-SQL 2410.01943](https://arxiv.org/abs/2410.01943)

---

## 8. Fine-tuning vs prompting — and the cost axis

- **A well-tuned small model can beat frontier prompting:** CodeS (1–15B) SFT "outperforms the leading GPT-4-based method (DIN-SQL, DAIL-SQL)" on Spider despite being far smaller. [CodeS 2402.16347](https://arxiv.org/abs/2402.16347)
- **Cost is the hidden variable:** GPT-3.5-turbo prompting offered the best EX-per-dollar in one survey; heavy pipelines (CoT + self-consistency + 100+ calls) cost up to **$0.46/query** while a lean method hit similar BIRD scores at **$0.039/query** — a ~10× difference. [SuperSQL 2406.01265](https://arxiv.org/abs/2406.01265), [2505.14174](https://arxiv.org/abs/2505.14174)
- This is exactly why the example's NeMo eval tracks `avg_tokens_per_llm_end`
  and `avg_llm_latency` alongside accuracy, and why the optimizer is
  multi-objective (maximize EX, minimize tokens and latency).

---

## 9. What does NOT work (or stops working)

- **Too many few-shot examples** — EX peaks ~3, then declines (−2.2% at 3-shot vs 1-shot for GPT-3.5). [2502.14913](https://arxiv.org/abs/2502.14913)
- **Few-shot *on top of* fine-tuning** — DAIL-SQL found fine-tuned models "fail to learn from contextual examples," causing "a sudden decrease in both EM and EX." Don't stack these two. [DAIL-SQL 2308.15363](https://arxiv.org/abs/2308.15363)
- **Naive CoT** — negligible gain for many models (§6). [2505.14174](https://arxiv.org/abs/2505.14174)
- **Over-pruning the schema** — dropping a needed column is unrecoverable (§2). [2408.07702](https://arxiv.org/abs/2408.07702)
- **Blind/unconditional self-correction on strong models** — over-edits correct SQL (§3). [DIN-SQL 2304.11015](https://arxiv.org/abs/2304.11015)
- **Stuffing a huge schema into a small model** — "lost in the middle": models use information best at the start/end of context, worst in the middle. Frontier reasoning models tolerate it; smaller ones don't. [Lost in the Middle](https://cs.stanford.edu/~nfliu/papers/lost-in-the-middle.arxiv2023.pdf)

---

## 10. Compounding returns — real, but they saturate

The honest version of "stacking techniques":

- **CHESS** (separable BIRD ablation): retrieval +4.76, table selection +6.12, revision +6.80 → full pipeline 66.69%. Big individual contributions — but the paper does **not** claim strict additivity. [CHESS 2405.16755](https://arxiv.org/abs/2405.16755)
- **CHASE-SQL**: value retrieval + 3 diverse generators + query fixer + trained selector → 73.0%, with an **oracle ceiling of 82.79%**. Generation gains saturate; *selection* becomes the limiter. [CHASE-SQL 2410.01943](https://arxiv.org/abs/2410.01943)
- **"Death of Schema Linking?"** explicitly stacks augmentation + selection + correction on a no-linking base to reach 71.83% — combination matters, but on a *strong* base. [2408.07702](https://arxiv.org/abs/2408.07702)

**Synthesis:** returns are **diminishing/saturating**, not additive. Get a
strong base model plus two high-value techniques (execution-grounded correction
+ good selection); after that, marginal gains shrink and at least one
combination (fine-tune + few-shot) is negative. The example encodes this with a
*diminishing-returns damping* on each successive technique and an explicit
negative step for over-stacking few-shot — see `simulate.py` and
`docs/visualization.html`.

```
 46.0 EX   base, raw DDL schema
 52.1 EX   + M-Schema + high-recall schema linking   (+6.1)
 55.5 EX   + query-plan chain-of-thought             (+3.4)
 57.7 EX   + similarity few-shot (k≈3)               (+2.2)
 60.5 EX   + execution-grounded self-correction      (+2.8)
 63.6 EX   + multi-candidate + trained selector      (+3.1)
 61.4 EX   + more few-shot (k=8)  ← OVER-STACKING     (-2.2)
```
*(Illustrative curve calibrated to the cited deltas; reproduce real numbers on
your data with `eval.run_ablation`.)*

---

## 11. Doing it end to end with the NeMo Agent Toolkit

The toolkit turns the loop above — **measure → improve → re-measure** — into
config and CLI, around your existing LangGraph agent (no rewrite).

1. **Wrap, don't rewrite.** The agent is plain LangGraph (`graph.py`).
   `register.py` exposes it to the toolkit via `@register_function`
   (`framework_wrappers=[LLMFrameworkEnum.LANGCHAIN]`), and the LLM is injected
   from the `llms:` block via `builder.get_llm(..., wrapper_type=LANGCHAIN)`.
   Run it: `nat run --config_file configs/text_to_sql.yml --input "..."`,
   or serve it as REST (`nat serve`) or as an **MCP tool** (`nat mcp serve`).

2. **Observe every run.** `general.telemetry.tracing.langsmith` ships
   OpenTelemetry traces to **LangSmith** (set `LANGSMITH_API_KEY`). Swap in
   `phoenix`/`weave`/`langfuse` with one line. You can now *see* which node
   (link / generate / correct / vote) costs tokens and latency.

3. **Measure correctness.** `nat eval --config_file configs/eval.yml` runs the
   dataset and scores it with our **custom `sql_execution_accuracy`** evaluator
   (`@register_evaluator`) — execution accuracy, the right SQL metric — plus
   latency and token-efficiency evaluators. The **profiler** block surfaces
   bottlenecks and token-usage forecasts.

4. **Improve automatically.** `nat optimize --config_file configs/optimizer.yml`
   searches the `search_space` over the *exact switches in this guide*
   (`use_schema_linking`, `use_cot`, `num_few_shot`, `max_corrections`,
   `self_consistency_n`, model, temperature) and keeps the Pareto front of
   (EX ↑, tokens ↓, latency ↓). This is the **automated ablation** — the
   toolkit finds the compounding combination for you.

5. **Compound over time (flywheel).** `self_improve.run_flywheel` promotes every
   execution-verified `(question, SQL)` pair into the few-shot bank, so similar
   future questions retrieve a worked example. It's the data-flywheel idea kept
   inside the prompt — no weight updates, immediate compounding. For weight-level
   improvement, the toolkit also offers `nat finetune` (RL) and DPO examples.

**Loop:** `nat run` → `nat eval` (+ LangSmith traces) → read failures →
`nat optimize` / grow the flywheel → re-eval. That is the whole compounding
engine, end to end.

---

## Sources

Benchmarks: [Spider](https://yale-lily.github.io/spider) ·
[BIRD](https://bird-bench.github.io/) · [BIRD paper](https://arxiv.org/abs/2305.03111) ·
[Spider 2.0](https://arxiv.org/abs/2411.07763) · [FLEX](https://aclanthology.org/2025.naacl-long.228.pdf)
Methods: [DIN-SQL](https://arxiv.org/abs/2304.11015) ·
[DAIL-SQL](https://arxiv.org/abs/2308.15363) · [MAC-SQL](https://arxiv.org/abs/2312.11242) ·
[CHESS](https://arxiv.org/abs/2405.16755) · [CHASE-SQL](https://arxiv.org/abs/2410.01943) ·
[XiYan-SQL](https://arxiv.org/abs/2411.08599) · [RESDSQL](https://arxiv.org/abs/2302.05965) ·
[RSL-SQL](https://arxiv.org/abs/2411.00073) · [Self-Debugging](https://arxiv.org/abs/2304.05128) ·
[Death of Schema Linking?](https://arxiv.org/abs/2408.07702) · [CodeS](https://arxiv.org/abs/2402.16347) ·
[SuperSQL survey](https://arxiv.org/abs/2406.01265) · [consistency survey](https://arxiv.org/abs/2408.05109) ·
[few-shot count](https://arxiv.org/abs/2502.14913) · [cost/CoT](https://arxiv.org/abs/2505.14174) ·
[Lost in the Middle](https://cs.stanford.edu/~nfliu/papers/lost-in-the-middle.arxiv2023.pdf)
NeMo Agent Toolkit: [repo](https://github.com/NVIDIA/NeMo-Agent-Toolkit) ·
[docs](https://docs.nvidia.com/nemo/agent-toolkit/latest/) ·
[self-correcting code-gen blog](https://developer.nvidia.com/blog/improve-ai-code-generation-using-nvidia-nemo-agent-toolkit/)

> Confidence notes: headline benchmark numbers recurred across independent
> sources (high confidence). Some per-component deltas were extracted from
> source summaries rather than read off the paper tables — verify against the
> original tables before quoting them as exact. Leaderboard "SOTA" figures are
> time-sensitive snapshots (early–mid 2026).
