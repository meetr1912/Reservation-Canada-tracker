"""NeMo Agent Toolkit (`nvidia-nat`) registration.

This is the bridge between the framework-agnostic LangGraph agent in `graph.py`
and the toolkit's YAML-driven runtime. Importing this module registers:

  * a `text_to_sql_agent` **function/workflow** that runs the self-correcting
    LangGraph graph using an LLM injected by the toolkit's builder, and
  * a `sql_execution_accuracy` **custom evaluator** that scores predictions by
    execution accuracy (run-and-compare against the gold query) — the metric
    that actually matters for SQL, which the built-in RAG evaluators don't cover.

API notes / version caveat
---------------------------
Import paths follow the current `nat.*` namespace (toolkit >= the AIQ->NAT
rename; `nvidia-nat` with the `[langchain]` and `[eval]` extras). The decorator
and `FunctionInfo.from_fn` / `EvaluatorInfo` shapes match the documented
patterns; minor keyword differences can occur across 1.x releases, so treat
this as the integration template and pin to your installed version.
"""
from __future__ import annotations

from pydantic import Field

try:  # the toolkit is an optional dependency for offline/unit use of graph.py
    from nat.builder.builder import Builder, EvalBuilder
    from nat.builder.evaluator import EvaluatorInfo
    from nat.builder.framework_enum import LLMFrameworkEnum
    from nat.builder.function_info import FunctionInfo
    from nat.cli.register_workflow import register_evaluator, register_function
    from nat.data_models.evaluator import EvaluatorBaseConfig
    from nat.data_models.function import FunctionBaseConfig
    _NAT_AVAILABLE = True
except Exception:  # pragma: no cover - keeps `import register` cheap offline
    _NAT_AVAILABLE = False


if _NAT_AVAILABLE:

    # ----------------------------- workflow ------------------------------- #
    class TextToSqlConfig(FunctionBaseConfig, name="text_to_sql_agent"):
        """Config surfaced in YAML under `functions:` / `workflow:`."""

        llm_name: str = Field(description="Name of an LLM defined in the `llms:` block.")
        db_path: str = Field(description="Path to the SQLite database file.")
        use_schema_linking: bool = True
        num_few_shot: int = 3
        use_cot: bool = True
        max_corrections: int = 2
        self_consistency_n: int = 1

    @register_function(
        config_type=TextToSqlConfig,
        framework_wrappers=[LLMFrameworkEnum.LANGCHAIN],
    )
    async def text_to_sql_agent(config: TextToSqlConfig, builder: Builder):
        """Register the self-correcting text-to-SQL LangGraph agent."""
        from .graph import AgentConfig, build_sql_agent_graph

        llm = await builder.get_llm(
            config.llm_name, wrapper_type=LLMFrameworkEnum.LANGCHAIN
        )
        agent_cfg = AgentConfig(
            use_schema_linking=config.use_schema_linking,
            num_few_shot=config.num_few_shot,
            use_cot=config.use_cot,
            max_corrections=config.max_corrections,
            self_consistency_n=config.self_consistency_n,
            db_path=config.db_path,
        )
        graph = build_sql_agent_graph(llm, agent_cfg)

        async def _run(question: str) -> str:
            state = await graph.ainvoke({"question": question})
            return state.get("sql", "")

        yield FunctionInfo.from_fn(
            _run,
            description=(
                "Translate a natural-language question about Parks Canada oTENTik "
                "availability into a SQLite query and return the SQL."
            ),
        )

    # ----------------------------- evaluator ------------------------------ #
    class SqlExecAccuracyConfig(EvaluatorBaseConfig, name="sql_execution_accuracy"):
        """Execution-accuracy evaluator config (under `eval.evaluators:`)."""

        db_path: str = Field(description="Path to the SQLite database file.")

    @register_evaluator(config_type=SqlExecAccuracyConfig)
    async def sql_execution_accuracy(config: SqlExecAccuracyConfig, builder: "EvalBuilder"):
        """Score predictions by comparing execution result sets to the gold SQL."""
        from .db import safe_execute

        async def evaluate_item(item):
            pred_sql = getattr(item, "output_obj", "") or ""
            gold_sql = getattr(item, "expected_output_obj", "") or ""
            pred = safe_execute(str(pred_sql), config.db_path)
            gold = safe_execute(str(gold_sql), config.db_path)
            correct = bool(gold.ok and pred.ok and pred.fingerprint() == gold.fingerprint())
            reasoning = {
                "pred_ok": pred.ok,
                "pred_error": pred.error,
                "match": correct,
            }
            # EvalOutputItem-shaped return; the harness aggregates `score`.
            return {"id": getattr(item, "id", None), "score": 1.0 if correct else 0.0,
                    "reasoning": reasoning}

        yield EvaluatorInfo(
            config=config,
            evaluate_fn=evaluate_item,
            description="Execution accuracy for text-to-SQL (run-and-compare).",
        )
