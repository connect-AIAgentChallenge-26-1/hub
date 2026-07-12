import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user import User


class EmailAlreadyRegisteredError(Exception):
    pass


# users.email의 unique index 이름 (alembic/versions/c4f6e182a5f8_create_users_table.py).
# 이 이름의 위반만 CONFLICT로 변환한다 — 다른 무결성 오류(향후 컬럼 추가 등)까지
# 이메일 중복으로 오분류하지 않기 위해서다(CLAUDE.md 절대 원칙 7 오류 구분).
_EMAIL_UNIQUE_CONSTRAINT = "ix_users_email"


class UserRepository:
    def __init__(self, db: Session):
        self._db = db

    def create(self, email: str, hashed_password: str) -> User:
        # 빠른 경로: 이미 존재하면 insert 없이 바로 거부한다. 다만 이 조회와
        # commit 사이에 다른 트랜잭션이 같은 이메일을 넣을 수 있으므로(동시 가입),
        # 최종 판정은 DB unique constraint가 내리고 여기서 CONFLICT로 변환한다.
        if self.get_by_email(email) is not None:
            raise EmailAlreadyRegisteredError(email)

        user = User(email=email, hashed_password=hashed_password)
        self._db.add(user)
        try:
            self._db.commit()
        except IntegrityError as exc:
            self._db.rollback()
            constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
            if constraint != _EMAIL_UNIQUE_CONSTRAINT:
                raise
            raise EmailAlreadyRegisteredError(email) from exc
        self._db.refresh(user)
        return user

    def get_by_email(self, email: str) -> User | None:
        return self._db.execute(select(User).where(User.email == email)).scalar_one_or_none()

    def get_by_id(self, user_id: uuid.UUID) -> User | None:
        return self._db.get(User, user_id)
