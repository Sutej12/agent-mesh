"use client";

import { useEffect, useState } from "react";

import { LogoutButton } from "@/components/LogoutButton";
import { getCurrentUser, getOperatorId, type SignedInUser } from "@/lib/api";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const SUPABASE_AUTH = isSupabaseConfigured();

export function AccountMenu() {
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!SUPABASE_AUTH) {
      setUser({
        id: getOperatorId(),
        email: "Local development",
        display_name: getOperatorId(),
        picture_url: null,
      });
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }
    let active = true;
    void getCurrentUser()
      .then((nextUser) => {
        if (active) {
          setUser(nextUser);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Could not load account");
        }
      });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && active) {
        setUser(null);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="field" style={{ marginTop: 16 }}>
      <span>{SUPABASE_AUTH ? "Google account" : "Local workspace"}</span>
      {user ? (
        <div className="meta account-session-row">
          <span>Signed in as {user.display_name || user.email}</span>
          <LogoutButton />
        </div>
      ) : (
        <p className="muted">No active account session.</p>
      )}
      {error && <p className="muted">{error}</p>}
    </div>
  );
}
