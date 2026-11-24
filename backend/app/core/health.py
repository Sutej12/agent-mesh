"""Dependency health checks used by the readiness probe.

Readiness answers "can this process actually serve traffic", which for us means
PostgreSQL and Redis are reachable. Each check is bounded by a short timeout: a probe
that hangs is worse than a probe that reports failure, because an orchestrator cannot
act on a pending answer.

The application readiness route supplies its shared SQLAlchemy engine so PostgreSQL
checks reuse the configured pool and TLS settings. The URL-only fallback is retained for
small unit tests and standalone diagnostics.
"""

from __future__ import annotations

import asyncio
import ssl
from dataclasses import dataclass

import asyncpg
import redis.asyncio as aioredis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.logging import get_logger

logger = get_logger(__name__)

CHECK_TIMEOUT_SECONDS = 3.0


@dataclass(frozen=True, slots=True)
class DependencyStatus:
    name: str
    healthy: bool
    detail: str | None = None
    latency_ms: float | None = None


def to_asyncpg_dsn(database_url: str) -> str:
    """Convert a SQLAlchemy-style URL to one asyncpg accepts.

    We store ``postgresql+asyncpg://...`` because that is what SQLAlchemy needs in
    Sprint 1, but asyncpg itself rejects the ``+driver`` suffix.
    """
    return database_url.replace("postgresql+asyncpg://", "postgresql://", 1)


async def _timed(name: str, coro: object) -> DependencyStatus:
    loop = asyncio.get_running_loop()
    started = loop.time()
    try:
        await asyncio.wait_for(coro, timeout=CHECK_TIMEOUT_SECONDS)  # type: ignore[arg-type]
    except TimeoutError:
        return DependencyStatus(
            name=name,
            healthy=False,
            detail=f"timed out after {CHECK_TIMEOUT_SECONDS}s",
            latency_ms=round((loop.time() - started) * 1000, 2),
        )
    except Exception as exc:
        # The message can contain a DSN with a password, so log the type only and return
        # a short class name instead of the raw string.
        logger.warning("dependency_check_failed", dependency=name, error_type=type(exc).__name__)
        return DependencyStatus(
            name=name,
            healthy=False,
            detail=type(exc).__name__,
            latency_ms=round((loop.time() - started) * 1000, 2),
        )
    return DependencyStatus(
        name=name,
        healthy=True,
        latency_ms=round((loop.time() - started) * 1000, 2),
    )


async def check_postgres(
    database_url: str,
    *,
    engine: AsyncEngine | None = None,
    ssl_context: ssl.SSLContext | None = None,
) -> DependencyStatus:
    async def _probe() -> None:
        if engine is not None:
            async with engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
            return

        connection = await asyncpg.connect(to_asyncpg_dsn(database_url), ssl=ssl_context)
        try:
            await connection.execute("SELECT 1")
        finally:
            await connection.close()

    return await _timed("postgres", _probe())


async def check_redis(redis_url: str) -> DependencyStatus:
    async def _probe() -> None:
        client = aioredis.from_url(redis_url)
        try:
            await client.ping()
        finally:
            await client.aclose()

    return await _timed("redis", _probe())
