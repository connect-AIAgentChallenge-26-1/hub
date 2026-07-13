import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user
from app.database import get_db
from app.models.meetup_session import MeetupSession
from app.models.session_participant import SessionParticipant
from app.models.user import User
from app.schemas.meetup import (
    InviteCreate,
    MeetupCreate,
    MeetupDetail,
    MeetupRead,
    ParticipantRead,
    RespondPayload,
)

router = APIRouter(prefix="/meetups", tags=["meetups"])


def _load_meetup(db: Session, meetup_id: uuid.UUID) -> MeetupSession | None:
    return (
        db.query(MeetupSession)
        .options(joinedload(MeetupSession.participants).joinedload(SessionParticipant.user))
        .filter(MeetupSession.id == meetup_id)
        .first()
    )


def _build_detail(meetup: MeetupSession) -> MeetupDetail:
    participants = [
        ParticipantRead(
            user_id=p.user_id,
            name=p.user.name,
            email=p.user.email,
            invite_status=p.invite_status,
        )
        # 생성자 먼저, 그 다음 초대 순서(생성 순)
        for p in sorted(meetup.participants, key=lambda p: p.user_id != meetup.creator_id)
    ]
    return MeetupDetail(
        id=meetup.id,
        creator_id=meetup.creator_id,
        title=meetup.title,
        status=meetup.status,
        location_name=meetup.location_name,
        food_category=meetup.food_category,
        created_at=meetup.created_at,
        participants=participants,
    )


@router.post("", response_model=MeetupRead, status_code=status.HTTP_201_CREATED)
def create_meetup(
    payload: MeetupCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MeetupSession:
    meetup = MeetupSession(creator_id=current_user.id, title=payload.title)
    db.add(meetup)
    db.flush()
    # 생성자를 accepted 참여자로 자동 등록
    db.add(
        SessionParticipant(
            session_id=meetup.id, user_id=current_user.id, invite_status="accepted"
        )
    )
    db.commit()
    db.refresh(meetup)
    return meetup


@router.get("", response_model=list[MeetupRead])
def list_my_meetups(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MeetupSession]:
    # 내가 만들었거나 초대받은(거절 제외) 모임
    return (
        db.query(MeetupSession)
        .join(SessionParticipant, SessionParticipant.session_id == MeetupSession.id)
        .filter(
            SessionParticipant.user_id == current_user.id,
            SessionParticipant.invite_status != "declined",
        )
        .order_by(MeetupSession.created_at.desc())
        .all()
    )


@router.get("/{meetup_id}", response_model=MeetupDetail)
def get_meetup(
    meetup_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MeetupDetail:
    meetup = _load_meetup(db, meetup_id)
    if meetup is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="모임을 찾을 수 없습니다.")
    # 참여자(생성자 포함)만 조회 가능
    if not any(p.user_id == current_user.id for p in meetup.participants):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="이 모임에 접근할 수 없습니다.")
    return _build_detail(meetup)


@router.post(
    "/{meetup_id}/participants",
    response_model=MeetupDetail,
    status_code=status.HTTP_201_CREATED,
)
def invite_participant(
    meetup_id: uuid.UUID,
    payload: InviteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MeetupDetail:
    meetup = _load_meetup(db, meetup_id)
    if meetup is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="모임을 찾을 수 없습니다.")
    if meetup.creator_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="모임 생성자만 초대할 수 있습니다.")

    invitee = db.query(User).filter(User.email == payload.email).first()
    if invitee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="가입된 사용자가 아닙니다.")

    already = any(p.user_id == invitee.id for p in meetup.participants)
    if already:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 초대된 사용자입니다.")

    db.add(
        SessionParticipant(session_id=meetup.id, user_id=invitee.id, invite_status="pending")
    )
    db.commit()
    return _build_detail(_load_meetup(db, meetup_id))


@router.post("/{meetup_id}/respond", response_model=MeetupDetail)
def respond_to_invite(
    meetup_id: uuid.UUID,
    payload: RespondPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MeetupDetail:
    participant = (
        db.query(SessionParticipant)
        .filter(
            SessionParticipant.session_id == meetup_id,
            SessionParticipant.user_id == current_user.id,
        )
        .first()
    )
    if participant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="초대받지 않은 모임입니다.")

    participant.invite_status = "accepted" if payload.action == "accept" else "declined"
    db.commit()
    return _build_detail(_load_meetup(db, meetup_id))
