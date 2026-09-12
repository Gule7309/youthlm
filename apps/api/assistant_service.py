"""Project-scoped context resolution for the YouthLM Assistant."""

import json
from collections.abc import Callable
from typing import Any, Protocol

from app.agent import AgentResult
from app.source_registry import SourceNotFoundError, SourceRegistry

from contract_models import (
    AssistantRequest,
    AssistantResolvedReference,
    AssistantResult,
    AssistantToolExecution,
)
from module_store import ModuleStore
from presentation_service import PresentationService


class AgentRunner(Protocol):
    """Minimal Agent boundary reused by analysis and Assistant flows."""

    def run(self, prompt: str) -> AgentResult: ...


class AssistantContextNotFoundError(RuntimeError):
    """Raised when explicit references are absent from the request project."""

    def __init__(self, missing_references: list[dict[str, str]]) -> None:
        self.missing_references = missing_references
        super().__init__("One or more Assistant context references were not found")


class AssistantService:
    """Resolve explicit references, invoke the Agent, and return a safe trace."""

    def __init__(
        self,
        agent_factory: Callable[[], AgentRunner],
        source_registry: SourceRegistry,
        module_store: ModuleStore,
        presentation_service: PresentationService,
    ) -> None:
        self._agent_factory = agent_factory
        self._source_registry = source_registry
        self._module_store = module_store
        self._presentation_service = presentation_service

    def run(self, request: AssistantRequest) -> AssistantResult:
        resolved_references: list[AssistantResolvedReference] = []
        context_payloads: list[dict[str, Any]] = []
        missing_references: list[dict[str, str]] = []

        for reference in request.context_references:
            payload = self._resolve_reference(
                request.project_id,
                reference.kind,
                reference.reference_id,
                reference.filters,
            )
            if payload is None:
                missing_references.append(
                    {
                        "kind": reference.kind,
                        "reference_id": reference.reference_id,
                    }
                )
                continue

            resolved_references.append(
                AssistantResolvedReference(
                    kind=reference.kind,
                    reference_id=reference.reference_id,
                    title=payload["title"],
                )
            )
            context_payloads.append(payload)

        if missing_references:
            raise AssistantContextNotFoundError(missing_references)

        agent_result = self._agent_factory().run(
            _build_assistant_prompt(request.message, context_payloads)
        )
        return AssistantResult(
            contract_version=request.contract_version,
            project_id=request.project_id,
            assistant_id=request.assistant_id,
            status="completed",
            answer=agent_result.answer,
            model_steps=agent_result.model_steps,
            resolved_references=resolved_references,
            tool_executions=[
                AssistantToolExecution(
                    call_id=execution.call_id,
                    name=execution.name,
                    arguments=execution.arguments,
                    status="completed" if execution.succeeded else "failed",
                )
                for execution in agent_result.tool_executions
            ],
        )

    def _resolve_reference(
        self,
        project_id: str,
        kind: str,
        reference_id: str,
        filters: dict[str, Any],
    ) -> dict[str, Any] | None:
        if kind == "source":
            try:
                source = self._source_registry.inspect_source(reference_id)
            except SourceNotFoundError:
                return None
            return {
                "kind": kind,
                "reference_id": reference_id,
                "title": source.title,
                "filters": filters,
                "source": source.model_dump(mode="json"),
            }

        if kind == "analysis":
            context = self._module_store.get_context(project_id, reference_id)
            if context is None:
                return None
            return {
                "kind": kind,
                "reference_id": reference_id,
                "title": context.title,
                "analysis": context.model_dump(mode="json"),
            }

        presentation = self._presentation_service.get_result(
            project_id,
            reference_id,
        )
        if presentation is None:
            return None
        source_modules = []
        for module_id in presentation.source_module_ids:
            context = self._module_store.get_context(project_id, module_id)
            if context is not None:
                source_modules.append(context.model_dump(mode="json"))
        return {
            "kind": kind,
            "reference_id": reference_id,
            "title": presentation.title,
            "presentation": presentation.model_dump(mode="json"),
            "source_modules": source_modules,
        }


def _build_assistant_prompt(
    message: str,
    context_payloads: list[dict[str, Any]],
) -> str:
    """Keep explicit @ references separate from free-form user text."""
    serialized_context = json.dumps(
        context_payloads,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return (
        "You are the YouthLM project assistant. Answer in Traditional Chinese. "
        "The context below was resolved by the backend from explicit @ references; "
        "never invent an unlisted source, analysis, presentation, value, or scope. "
        "Preserve source limitations and warnings. Use the available deterministic "
        "tools when the user asks for data not already present in the resolved "
        "context. Do not claim that a presentation file itself was inspected; use "
        "its stored metadata and source analysis modules.\n\n"
        f"User message:\n{message}\n\n"
        f"Resolved project context JSON:\n{serialized_context}"
    )
