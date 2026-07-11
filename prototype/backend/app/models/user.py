import uuid
from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.calendar_integration import CalendarIntegration
    from app.models.meetup_session import MeetupSession
    from app.models.session_participant import SessionParticipant


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    # 구글 OAuth로만 가입한 유저는 비밀번호가 없다
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True, index=True, nullable=True)

    calendar_integrations: Mapped[list["CalendarIntegration"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    created_sessions: Mapped[list["MeetupSession"]] = relationship(
        back_populates="creator", cascade="all, delete-orphan"
    )
    session_participations: Mapped[list["SessionParticipant"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
