from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://bapyak:bapyak@localhost:5432/bapyak"
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24
    cors_origins: list[str] = ["http://localhost:5173"]

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/auth/google/callback"
    frontend_url: str = "http://localhost:5173"

    # 맛집 추천 (없으면 목업 데이터로 동작)
    naver_client_id: str = ""
    naver_client_secret: str = ""
    kakao_rest_api_key: str = ""


settings = Settings()
