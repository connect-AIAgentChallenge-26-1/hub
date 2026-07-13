"""Environment variable schema — the single place backend config is read from.

Mirrors docs/prerequisites.md ".env 변수 미리보기" plus the auth/DB variables
T01 introduces. Real values live only in .env (gitignored); this module never
has a default for a secret, so a missing required variable fails startup
loudly instead of silently running with an empty key (CLAUDE.md 절대 원칙 8).
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"

    database_url: str

    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60

    # Populated in later Tasks (T02/T03/T06); optional now so backend startup
    # does not require credentials it does not yet use.
    dart_api_key: str | None = None
    kis_app_key: str | None = None
    kis_app_secret: str | None = None
    kis_env: str = "vps"
    naver_client_id: str | None = None
    naver_client_secret: str | None = None
    upstage_api_key: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
