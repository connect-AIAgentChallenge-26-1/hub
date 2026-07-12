import jwt
import pytest

from app.security.passwords import hash_password, verify_password
from app.security.tokens import InvalidTokenError, create_access_token, decode_access_token


def test_hash_password_roundtrip():
    hashed = hash_password("correct horse battery staple")
    assert hashed != "correct horse battery staple"
    assert verify_password("correct horse battery staple", hashed) is True


def test_verify_password_rejects_wrong_password():
    hashed = hash_password("correct horse battery staple")
    assert verify_password("wrong password", hashed) is False


def test_access_token_roundtrip():
    token = create_access_token(subject="user-123")
    assert decode_access_token(token) == "user-123"


def test_decode_rejects_garbage_token():
    with pytest.raises(InvalidTokenError):
        decode_access_token("not-a-real-token")


def test_decode_rejects_expired_token():
    token = create_access_token(subject="user-123", expires_minutes=-1)
    with pytest.raises(InvalidTokenError):
        decode_access_token(token)


def test_decode_rejects_token_signed_with_wrong_key():
    forged = jwt.encode(
        {"sub": "user-123"}, "someone-elses-secret-key-32-bytes!", algorithm="HS256"
    )
    with pytest.raises(InvalidTokenError):
        decode_access_token(forged)
