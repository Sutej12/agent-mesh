"""Async engine and session management.

One engine per process, created lazily so importing this module has no side effects and
tests can point it at a different database.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import Settings
from app.database.tls import database_ssl_context


def create_engine_from_url(
    url: str,
    *,
    pool_size: int = 5,
    max_overflow: int = 10,
    pool_timeout: float = 10.0,
    pool_recycle: int = 1_800,
    connect_args: dict[str, object] | None = None,
) -> AsyncEngine:
    return create_async_engine(
        url,
        echo=False,
        pool_pre_ping=True,  # a recycled connection killed by the DB fails fast, not mid-query
        pool_size=pool_size,
        max_overflow=max_overflow,
        pool_timeout=pool_timeout,
        pool_recycle=pool_recycle,
        connect_args=connect_args or {},
    )


def create_engine(settings: Settings) -> AsyncEngine:
    ssl_context = database_ssl_context(settings)
    return create_engine_from_url(
        settings.database_url,
        pool_size=settings.database_pool_size,
        max_overflow=settings.database_max_overflow,
        pool_timeout=settings.database_pool_timeout_seconds,
        pool_recycle=settings.database_pool_recycle_seconds,
        connect_args={"ssl": ssl_context} if ssl_context is not None else None,
    )


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        bind=engine,
        expire_on_commit=False,  # objects stay usable after commit, which async callers expect
        autoflush=False,
    )


@asynccontextmanager
async def session_scope(
    factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncSession]:
    """Provide a session that commits on success and rolls back on failure."""
    session = factory()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
