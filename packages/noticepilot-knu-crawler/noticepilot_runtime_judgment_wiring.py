#!/usr/bin/env python3
"""Runtime serialization for NoticePilot S24 layered judgments.

S24-B and S24-C extracted standalone evaluators while preserving the legacy
candidate projection. S24-D makes those immutable judgments first-class runtime
candidate fields and keeps them synchronized after compatibility mutations.
"""
from __future__ import annotations

from typing import Any

from noticepilot_applicability_evaluator import ApplicabilityEvaluator
from noticepilot_publishability_evaluator import PublishabilityEvaluator

RUNTIME_JUDGMENT_WIRING_VERSION = "0.1.0"


class RuntimeJudgmentWiring:
    """Serialize evaluator-owned judgments onto a compatibility candidate."""

    version = RUNTIME_JUDGMENT_WIRING_VERSION

    def __init__(
        self,
        applicability_evaluator: ApplicabilityEvaluator | None = None,
        publishability_evaluator: PublishabilityEvaluator | None = None,
    ) -> None:
        self.applicability_evaluator = applicability_evaluator or ApplicabilityEvaluator()
        self.publishability_evaluator = publishability_evaluator or PublishabilityEvaluator()

    def wire_applicability(self, candidate: dict[str, Any]) -> dict[str, Any]:
        rules = candidate.get("audienceRules") or {}
        judgment = self.applicability_evaluator.evaluate_projection(
            target_actor=str(candidate.get("targetActor") or "unknown"),
            audience_rules=rules,
            reason_codes=candidate.get("reasonCodes") or (),
            actor_confidence=rules.get("confidence"),
        )
        candidate["applicabilityJudgment"] = judgment.to_dict()
        return candidate

    def wire_publishability(self, candidate: dict[str, Any]) -> dict[str, Any]:
        projection = self.publishability_evaluator.evaluate_projection(candidate)
        candidate["publishabilityJudgment"] = projection.judgment.to_dict()
        return candidate

    def wire_candidate(self, candidate: dict[str, Any]) -> dict[str, Any]:
        self.wire_applicability(candidate)
        self.wire_publishability(candidate)
        return candidate


__all__ = [
    "RUNTIME_JUDGMENT_WIRING_VERSION",
    "RuntimeJudgmentWiring",
]
