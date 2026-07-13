import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class MeetupCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)


class MeetupRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    creator_id: uuid.UUID
    title: str
    status: str
    confirmed_start: datetime | None
    confirmed_end: datetime | None
    location_name: str | None
    food_category: str | None
    created_at: datetime


class ParticipantRead(BaseModel):
    user_id: uuid.UUID
    name: str
    email: EmailStr
    invite_status: str


class MeetupDetail(MeetupRead):
    participants: list[ParticipantRead]


class UserSearchResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: EmailStr


class InviteCreate(BaseModel):
    email: EmailStr


class RespondPayload(BaseModel):
    action: str = Field(pattern="^(accept|decline)$")


class AvailableSlot(BaseModel):
    start: datetime
    end: datetime
    duration_min: int
    overlaps_lunch: bool
    overlaps_dinner: bool


class AvailableTimesResponse(BaseModel):
    accepted_count: int  # 계산에 반영된 수락 참여자 수
    slots: list[AvailableSlot]


class ConfirmTimePayload(BaseModel):
    start: datetime
    end: datetime
