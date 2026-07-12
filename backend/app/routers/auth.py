from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.dependencies import NotAuthenticatedError, get_current_user, get_db
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.auth import LoginRequest, RegisterRequest, TokenPayload, UserPayload
from app.schemas.envelope import Envelope, Status, now_utc
from app.security.passwords import hash_password, verify_password
from app.security.tokens import create_access_token

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _envelope[T: (TokenPayload, UserPayload)](request: Request, data: T) -> Envelope[T]:
    started_at = now_utc()
    return Envelope[T](
        request_id=request.state.request_id,
        trace_id=request.state.trace_id,
        as_of=started_at.date(),
        status=Status.SUCCESS,
        source_ids=[],
        model_or_rule_version="auth-1.0.0",
        started_at=started_at,
        completed_at=now_utc(),
        data=data,
    )


@router.post("/register", response_model=Envelope[TokenPayload])
def register(
    payload: RegisterRequest, request: Request, db: Session = Depends(get_db)
) -> Envelope[TokenPayload]:
    repo = UserRepository(db)
    user = repo.create(email=payload.email, hashed_password=hash_password(payload.password))
    token = create_access_token(subject=str(user.id))
    data = TokenPayload(access_token=token, user=UserPayload(user_id=user.id, email=user.email))
    return _envelope(request, data)


@router.post("/login", response_model=Envelope[TokenPayload])
def login(
    payload: LoginRequest, request: Request, db: Session = Depends(get_db)
) -> Envelope[TokenPayload]:
    repo = UserRepository(db)
    user = repo.get_by_email(payload.email)
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise NotAuthenticatedError("invalid email or password")

    token = create_access_token(subject=str(user.id))
    data = TokenPayload(access_token=token, user=UserPayload(user_id=user.id, email=user.email))
    return _envelope(request, data)


@router.get("/me", response_model=Envelope[UserPayload])
def me(request: Request, current_user: User = Depends(get_current_user)) -> Envelope[UserPayload]:
    data = UserPayload(user_id=current_user.id, email=current_user.email)
    return _envelope(request, data)
