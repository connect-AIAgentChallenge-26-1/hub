import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app.repositories.user_repository import EmailAlreadyRegisteredError, UserRepository


def test_create_and_get_by_email(db_session):
    repo = UserRepository(db_session)
    user = repo.create(email="student@example.com", hashed_password="hashed")

    found = repo.get_by_email("student@example.com")
    assert found is not None
    assert found.id == user.id


def test_create_rejects_duplicate_email(db_session):
    repo = UserRepository(db_session)
    repo.create(email="dup@example.com", hashed_password="hashed")

    with pytest.raises(EmailAlreadyRegisteredError):
        repo.create(email="dup@example.com", hashed_password="hashed-2")


def test_duplicate_insert_racing_past_precheck_maps_to_conflict(db_session, monkeypatch):
    # 동시 가입 경쟁 재현: check-then-act의 사전 조회가 상대 트랜잭션을 보지
    # 못한 상황(get_by_email이 None)을 강제해 insert가 DB unique constraint에
    # 부딪히게 한다. IntegrityError가 미처리 500으로 새지 않고 결정론적
    # CONFLICT(EmailAlreadyRegisteredError)로 변환돼야 한다.
    repo = UserRepository(db_session)
    repo.create(email="race@example.com", hashed_password="hashed")

    monkeypatch.setattr(repo, "get_by_email", lambda email: None)
    with pytest.raises(EmailAlreadyRegisteredError):
        repo.create(email="race@example.com", hashed_password="hashed-2")
    monkeypatch.undo()

    # rollback이 수행돼 같은 세션이 계속 사용 가능해야 한다.
    found = repo.get_by_email("race@example.com")
    assert found is not None
    assert found.hashed_password == "hashed"


class _FakeDiag:
    def __init__(self, constraint_name: str) -> None:
        self.constraint_name = constraint_name


class _FakeOrig(Exception):
    def __init__(self, constraint_name: str) -> None:
        super().__init__("fake db error")
        self.diag = _FakeDiag(constraint_name)


def test_integrity_error_on_unrelated_constraint_is_not_swallowed(db_session, monkeypatch):
    # 이메일 unique index가 아닌 다른 무결성 위반(예: 향후 추가될 컬럼의
    # constraint)까지 EMAIL_ALREADY_REGISTERED로 오분류해서는 안 된다 —
    # 관련 없는 구현 오류는 그대로 전파돼 INTERNAL_ERROR로 처리돼야 한다.
    repo = UserRepository(db_session)

    def fake_commit():
        raise IntegrityError("INSERT ...", {}, _FakeOrig("some_other_constraint"))

    monkeypatch.setattr(db_session, "commit", fake_commit)
    with pytest.raises(IntegrityError):
        repo.create(email="unrelated@example.com", hashed_password="hashed")


def test_get_by_email_returns_none_when_missing(db_session):
    repo = UserRepository(db_session)
    assert repo.get_by_email("nobody@example.com") is None


def test_get_by_id_returns_none_for_unknown_id(db_session):
    repo = UserRepository(db_session)
    assert repo.get_by_id(uuid.uuid4()) is None
