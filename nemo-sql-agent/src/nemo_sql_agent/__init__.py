"""Self-improving text-to-SQL agent for the Parks Canada oTENTik tracker.

A NeMo Agent Toolkit example: a LangGraph text-to-SQL agent with toggleable,
evidence-backed techniques, LangSmith tracing, a custom execution-accuracy
evaluator, and a self-improvement flywheel. See docs/GUIDE.md.
"""
from .graph import AgentConfig, answer_question, build_sql_agent_graph

__all__ = ["AgentConfig", "answer_question", "build_sql_agent_graph"]
__version__ = "0.1.0"
