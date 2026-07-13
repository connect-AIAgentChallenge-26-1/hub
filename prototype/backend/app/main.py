from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, calendars, google_auth, meetups, users

app = FastAPI(title="밥약 매칭 서비스 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(google_auth.router)
app.include_router(calendars.router)
app.include_router(meetups.router)
app.include_router(users.router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
