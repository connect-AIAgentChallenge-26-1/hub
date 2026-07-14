from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator


class PreNormalizeCandidateInput(BaseModel):
    record_id: str
    effective_date: date
    source_type: str
    is_correction: bool = False
    is_provisional: bool = False
    corp_code: str | None = None


class PreNormalizeRequest(BaseModel):
    mode: Literal["PRE_NORMALIZE"]
    candidates: list[PreNormalizeCandidateInput]
    as_of: date


class PostDerivedCheckInput(BaseModel):
    record_id: str
    corp_code: str
    source_ids: list[str] = Field(min_length=1)
    source_corp_codes: list[str] = Field(min_length=1)
    unit: str
    source_units: list[str] = Field(min_length=1)
    as_of: date
    source_as_of: list[date] = Field(min_length=1)
    formula_version: str
    target_period: str
    source_periods: list[str] = Field(min_length=1)

    @model_validator(mode="after")
    def _source_metadata_lengths_match(self) -> "PostDerivedCheckInput":
        # source_ids만 비어있지 않다고 끝이 아니다 — source_corp_codes/
        # source_units/source_periods 개수가 source_ids와 어긋나면 어떤 원소가
        # 어떤 source를 가리키는지 알 수 없다(post_derived()의 같은 검사와
        # 대응, API 단계에서 더 일찍 막는다). source_as_of만은 예외로 "이상"만
        # 요구한다 — financial_facts.py가 자체 source_id가 없는 시세·발행주식
        # 수 기준일도 같은 배열에 더해 source_ids보다 길어질 수 있다.
        n = len(self.source_ids)
        if (
            len(self.source_corp_codes) != n
            or len(self.source_units) != n
            or len(self.source_periods) != n
            or len(self.source_as_of) < n
        ):
            raise ValueError(
                "source_corp_codes/source_units/source_periods must have the same "
                "length as source_ids, and source_as_of must have at least as many"
            )
        return self


class PostDerivedRequest(BaseModel):
    mode: Literal["POST_DERIVED"]
    derived_checks: list[PostDerivedCheckInput]
    normalization_policy_ref: str
    as_of: date


TemporalIntegrityRequest = Annotated[
    PreNormalizeRequest | PostDerivedRequest, Field(discriminator="mode")
]


class PreNormalizePayload(BaseModel):
    mode: Literal["PRE_NORMALIZE"] = "PRE_NORMALIZE"
    eligible_record_ids: list[str]
    rejected_record_ids: list[str]
    normalization_policy: str
    integrity_log: list[str]
    temporal_warnings: list[str]


class PostDerivedPayload(BaseModel):
    mode: Literal["POST_DERIVED"] = "POST_DERIVED"
    verified_record_ids: list[str]
    rejected_record_ids: list[str]
    normalization_policy: str
    integrity_log: list[str]
