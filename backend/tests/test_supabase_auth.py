"""Supabase JWT verification and local profile synchronization."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.dependencies import get_session
from app.core.config import Settings
from app.core.supabase_auth import verify_supabase_access_token
from app.main import create_app

ISSUER = "https://test-project.supabase.co/auth/v1"
SUBJECT = "c74fd9cf-46f7-4a6e-bbcb-2602cbe74b92"


def _rsa_pair() -> tuple[bytes, object]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return private, key.public_key()


def _settings() -> Settings:
    return Settings(
        environment="test",
        auth_mode="supabase",
        supabase_url="https://test-project.supabase.co",
        rate_limit_backend="memory",
        seed_agents_on_startup=False,
        _env_file=None,
    )


def _token(
    private: bytes,
    *,
    subject: str = SUBJECT,
    audience: str = "authenticated",
    role: str = "authenticated",
    issuer: str = ISSUER,
    expires: timedelta = timedelta(minutes=5),
) -> str:
    now = datetime.now(UTC)
    encoded = jwt.encode(
        {
            "iss": issuer,
            "aud": audience,
            "sub": subject,
            "role": role,
            "email": "alice@example.com",
            "is_anonymous": False,
            "user_metadata": {
                "full_name": "Alice Example",
                "avatar_url": "https://example.com/alice.png",
            },
            "iat": now,
            "exp": now + expires,
        },
        private,
        algorithm="RS256",
    )
    return encoded if isinstance(encoded, str) else encoded.decode()


async def test_valid_supabase_token_yields_profile_identity() -> None:
    private, public = _rsa_pair()
    identity = await verify_supabase_access_token(
        _token(private),
        _settings(),
        signing_key=public,
    )

    assert identity.id == SUBJECT
    assert identity.source == "supabase"
    assert identity.email == "alice@example.com"
    assert identity.display_name == "Alice Example"
    assert identity.picture_url == "https://example.com/alice.png"


@pytest.mark.parametrize(
    "token_overrides",
    [
        {"audience": "wrong"},
        {"issuer": "https://attacker.example/auth/v1"},
        {"role": "anon"},
        {"expires": timedelta(seconds=-1)},
    ],
)
async def test_invalid_supabase_claims_are_rejected(token_overrides: dict[str, Any]) -> None:
    private, public = _rsa_pair()
    with pytest.raises(Exception) as exc:
        await verify_supabase_access_token(
            _token(private, **token_overrides),
            _settings(),
            signing_key=public,
        )
    assert getattr(exc.value, "status_code", None) == 401


async def test_supabase_me_creates_local_profile_and_ignores_operator_header(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    private, public = _rsa_pair()
    app = create_app(_settings())
    app.state.supabase_token_key = public
    app.state.session_factory = session_factory

    async def override_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session
            await session.commit()

    app.dependency_overrides[get_session] = override_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/auth/me",
            headers={
                "Authorization": f"Bearer {_token(private)}",
                "X-Operator-Id": "spoofed-user",
            },
        )
        assert response.status_code == 200, response.text
        assert response.json() == {
            "id": SUBJECT,
            "email": "alice@example.com",
            "display_name": "Alice Example",
            "picture_url": "https://example.com/alice.png",
        }

        same_user = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {_token(private)}"},
        )
        assert same_user.status_code == 200


async def test_legacy_login_endpoints_are_disabled_in_supabase_mode(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    app = create_app(_settings())

    async def override_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/auth/login",
            json={"email": "alice@example.com", "password": "not-used"},
        )
    assert response.status_code == 404
