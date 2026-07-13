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
