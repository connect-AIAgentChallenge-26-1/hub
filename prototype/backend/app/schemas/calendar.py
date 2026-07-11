import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class EverytimeConnect(BaseModel):
    share_url: str = Field(min_length=1, max_length=255)


class AppleConnect(BaseModel):
    apple_id: str = Field(min_length=3, max_length=255)
    app_password: str = Field(min_length=1, max_length=100)


class IntegrationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    provider: str
    external_calendar_id: str


class EventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    integration_id: uuid.UUID
    title: str
    start_time: datetime
    end_time: datetime
