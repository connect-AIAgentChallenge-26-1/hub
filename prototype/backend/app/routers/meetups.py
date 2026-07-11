from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.meetup_session import MeetupSession
from app.models.user import User
from app.schemas.meetup import MeetupCreate, MeetupRead

router = APIRouter(prefix="/meetups", tags=["meetups"])


@router.post("", response_model=MeetupRead, status_code=status.HTTP_201_CREATED)
def create_meetup(
    payload: MeetupCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MeetupSession:
    meetup = MeetupSession(creator_id=current_user.id, title=payload.title)
    db.add(meetup)
    db.commit()
    db.refresh(meetup)
    return meetup


@router.get("", response_model=list[MeetupRead])
def list_my_meetups(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MeetupSession]:
    return (
        db.query(MeetupSession)
        .filter(MeetupSession.creator_id == current_user.id)
        .order_by(MeetupSession.created_at.desc())
        .all()
    )
