"""TLS configuration shared by SQLAlchemy and low-level PostgreSQL probes."""

from __future__ import annotations

import ssl

from app.core.config import Settings


def database_ssl_context(settings: Settings) -> ssl.SSLContext | None:
    """Build the asyncpg SSL context selected by application settings.

    ``require`` encrypts the connection without validating the server certificate,
    matching libpq's sslmode semantics. ``verify-ca`` validates the certificate chain
    without hostname matching, while ``verify-full`` validates both. Production should
    prefer ``verify-full`` with the Supabase CA certificate.
    """

    mode = settings.database_ssl_mode
    if mode == "disable":
        return None

    if mode == "require":
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        return context

    context = ssl.create_default_context(cafile=settings.database_ssl_ca_file)
    if mode == "verify-ca":
        context.check_hostname = False
    return context
