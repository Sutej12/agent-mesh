"""Supabase access-token verification against the project's rotating JWKS."""

from __future__ import annotations

import asyncio
from functools import lru_cache
from typing import Any

import jwt
from fastapi import HTTPException, status

from app.core.config import Settings
from app.core.identity import OperatorIdentity, validate_operator_id

_ALGORITHMS = ["ES256", "RS256"]


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


@lru_cache(maxsize=8)
def _jwks_client(url: str) -> jwt.PyJWKClient:
    # PyJWKClient caches both the JWKS document and resolved signing keys. It refreshes
    # when a new ``kid`` appears, which is required for zero-downtime key rotation.
    return jwt.PyJWKClient(
        url,
        cache_keys=True,
        cache_jwk_set=True,
        lifespan=300,
        timeout=5,
    )


def _metadata_string(metadata: object, *keys: str) -> str | None:
    if not isinstance(metadata, dict):
        return None
    for key in keys:
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


async def verify_supabase_access_token(
    token: str,
    settings: Settings,
    *,
    signing_key: object | None = None,
) -> OperatorIdentity:
    """Verify a Supabase session access token and return its durable identity.

    Remote JWKS discovery is run in a worker thread because PyJWT's client performs a
    synchronous HTTPS request on its first lookup. Subsequent requests use its bounded
    in-memory cache.
    """

    issuer = settings.effective_supabase_issuer
    jwks_url = settings.effective_supabase_jwks_url
    if not issuer or not jwks_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase authentication is not configured",
        )
    if not token.strip():
        raise _unauthorized("Supabase access token is missing")

    key = signing_key
    if key is None:
        try:
            resolved = await asyncio.to_thread(
                _jwks_client(jwks_url).get_signing_key_from_jwt,
                token,
            )
            key = resolved.key
        except (jwt.PyJWKClientError, jwt.PyJWTError, ValueError) as exc:
            raise _unauthorized("Supabase access token signing key is invalid") from exc

    try:
        claims: dict[str, Any] = jwt.decode(
            token,
            key,  # type: ignore[arg-type]
            algorithms=_ALGORITHMS,
            audience=settings.supabase_jwt_audience,
            issuer=issuer,
            options={"require": ["sub", "exp", "iss", "aud"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise _unauthorized("Supabase access token has expired") from exc
    except jwt.PyJWTError as exc:
        raise _unauthorized("Supabase access token is invalid") from exc

    if claims.get("role") != "authenticated" or claims.get("is_anonymous") is True:
        raise _unauthorized("An authenticated Supabase user is required")

    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject.strip():
        raise _unauthorized("Supabase access token is missing its subject")

    email = claims.get("email")
    metadata = claims.get("user_metadata")
    return OperatorIdentity(
        id=validate_operator_id(subject),
        source="supabase",
        email=email.strip().lower() if isinstance(email, str) and email.strip() else None,
        display_name=_metadata_string(metadata, "full_name", "name", "display_name"),
        picture_url=_metadata_string(metadata, "avatar_url", "picture"),
    )
