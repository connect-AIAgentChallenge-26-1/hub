import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


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
