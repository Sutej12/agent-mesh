"""Managed PostgreSQL TLS modes map to the expected asyncpg SSL contexts."""

from __future__ import annotations

import ssl

from app.core.config import Settings
from app.database.tls import database_ssl_context


def _settings(mode: str) -> Settings:
    return Settings(database_ssl_mode=mode, _env_file=None)  # type: ignore[arg-type]


def test_database_tls_can_be_disabled_for_local_postgres() -> None:
    assert database_ssl_context(_settings("disable")) is None


def test_database_tls_require_encrypts_without_certificate_verification() -> None:
    context = database_ssl_context(_settings("require"))
    assert context is not None
    assert context.verify_mode == ssl.CERT_NONE
    assert context.check_hostname is False


def test_database_tls_verify_ca_checks_certificate_chain_only() -> None:
    context = database_ssl_context(_settings("verify-ca"))
    assert context is not None
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is False


def test_database_tls_verify_full_checks_certificate_and_hostname() -> None:
    context = database_ssl_context(_settings("verify-full"))
    assert context is not None
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True
