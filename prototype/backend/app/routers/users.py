from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.meetup import UserSearchResult

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/search", response_model=list[UserSearchResult])
def search_users(
    email: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[User]:
    query = email.strip()
    if len(query) < 2:
        return []
    return (
        db.query(User)
        .filter(User.email.ilike(f"%{query}%"), User.id != current_user.id)
        .order_by(User.email)
        .limit(10)
        .all()
    )
