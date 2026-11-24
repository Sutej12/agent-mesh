"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import {
  getOperatorId,
  loginWithPassword,
  markWorkspaceAuthed,
  setOperatorId,
  setSessionToken,
} from "@/lib/api";
import { BRAND_TAGLINE } from "@/lib/brand";
import { requireSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSiteUrl, isSupabaseConfigured } from "@/lib/supabase/config";

const SUPABASE_AUTH = isSupabaseConfigured();

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [operator, setOperator] = useState("");
  const [showLocal, setShowLocal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!SUPABASE_AUTH) {
      setOperator(getOperatorId());
    }
    const callbackError = new URLSearchParams(window.location.search).get("error");
    if (callbackError) {
      const messages: Record<string, string> = {
        supabase_not_configured: "Supabase authentication is not configured.",
        missing_oauth_code: "Google did not return an authorization code.",
        oauth_callback_failed: "Google sign-in could not be completed. Please try again.",
      };
      setError(messages[callbackError] ?? "Google sign-in could not be completed.");
    }
  }, []);

  const startGoogleLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      const supabase = requireSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${getSiteUrl()}/auth/callback?next=/office` },
      });
      if (authError) {
        throw authError;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google sign-in failed");
      setBusy(false);
    }
  };

  const onPasswordLogin = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await loginWithPassword({ email: email.trim(), password });
      setOperatorId(user.id);
      markWorkspaceAuthed();
      router.push("/office");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const continueAsOperator = (event: FormEvent) => {
    event.preventDefault();
    const value = operator.trim() || "operator";
    setSessionToken(null);
    setOperatorId(value);
    markWorkspaceAuthed();
    router.push("/office");
  };

  return (
    <main className="login-shell" data-testid="login-page">
      <section className="login-card">
        <BrandLogo size={48} variant="mark" />
        <h1>Log in</h1>
        <p className="login-tagline">{BRAND_TAGLINE}</p>

        {SUPABASE_AUTH ? (
          <div className="stack-gap">
            <button
              type="button"
              className="px-btn primary"
              disabled={busy}
              data-testid="google-signin"
              onClick={() => void startGoogleLogin()}
            >
              {busy ? "Opening Google…" : "Continue with Google"}
            </button>
            <p className="meta" style={{ margin: 0 }}>
              Google authentication is securely managed by Supabase.
            </p>
          </div>
        ) : (
          <>
            <form onSubmit={onPasswordLogin} className="stack-gap">
              <label className="field">
                <span>Email</span>
                <input
                  data-testid="login-email"
                  type="email"
                  required
                  value={email}
                  disabled={busy}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  data-testid="login-password"
                  type="password"
                  required
                  value={password}
                  disabled={busy}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                />
              </label>
              <button
                type="submit"
                className="px-btn primary"
                disabled={busy}
                data-testid="login-submit"
              >
                {busy ? "Signing in…" : "Log in"}
              </button>
            </form>

            <button
              type="button"
              className="meta"
              style={{
                marginTop: 12,
                background: "none",
                border: "none",
                padding: 0,
                color: "inherit",
                cursor: "pointer",
                textDecoration: "underline",
              }}
              onClick={() => setShowLocal((value) => !value)}
            >
              {showLocal ? "Hide local workspace" : "Continue with a local workspace name"}
            </button>

            {showLocal && (
              <form onSubmit={continueAsOperator} className="stack-gap" style={{ marginTop: 12 }}>
                <label className="field">
                  <span>Workspace name</span>
                  <input
                    data-testid="login-operator"
                    value={operator}
                    disabled={busy}
                    onChange={(event) => setOperator(event.target.value)}
                    placeholder="operator"
                    autoComplete="username"
                  />
                </label>
                <p className="meta" style={{ margin: 0 }}>
                  Development-only access; production should configure Supabase.
                </p>
                <button
                  type="submit"
                  className="px-btn"
                  disabled={busy}
                  data-testid="login-continue"
                >
                  Continue to workspace
                </button>
              </form>
            )}
          </>
        )}

        {error && (
          <p className="banner-err" role="alert">
            {error}
          </p>
        )}

        <p className="meta" style={{ marginTop: 16 }}>
          {!SUPABASE_AUTH && (
            <>
              New here? <Link href="/signup">Sign up</Link>
              {" · "}
            </>
          )}
          <Link href="/">Back to product site</Link>
        </p>
      </section>
    </main>
  );
}
