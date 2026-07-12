import os
from collections.abc import Generator

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://hub:hub@localhost:5442/hub")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-local-dev-only")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.db import Base, make_engine
from app.dependencies import get_db
from app.main import create_app


@pytest.fixture(scope="session")
def engine() -> Generator[Engine, None, None]:
    eng = make_engine(get_settings().database_url)
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def db_session(engine: Engine) -> Generator[Session, None, None]:
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
        with engine.begin() as conn:
            for table in reversed(Base.metadata.sorted_tables):
                conn.execute(table.delete())


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient, None, None]:
    app = create_app()

    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
