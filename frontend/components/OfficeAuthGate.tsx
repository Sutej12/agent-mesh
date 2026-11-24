"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { getCurrentUser, isWorkspaceAuthed, setOperatorId } from "@/lib/api";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Sends visitors to /login before the workspace mounts. Supabase deployments verify
 * signed claims; the browser-storage fallback exists only for unconfigured local/E2E.
 */
export function OfficeAuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      if (!isWorkspaceAuthed()) {
        router.replace("/login");
        return;
      }
      setReady(true);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let active = true;
    if (!supabase) {
      router.replace("/login");
      return;
    }

    const verify = async () => {
      const { data, error } = await supabase.auth.getClaims();
      const subject = data?.claims?.sub;
      if (!active) {
        return;
      }
      if (error || typeof subject !== "string" || !subject) {
        router.replace("/login");
        return;
      }
      setOperatorId(subject);
      setReady(true);
      // This creates/refreshes Agent Mesh's local profile row. Authentication itself
      // remains authoritative in Supabase, so a temporary sync failure does not grant access.
      void getCurrentUser().catch(() => undefined);
    };

    void verify();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setReady(false);
        router.replace("/login");
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [router]);

  if (!ready) {
    return (
      <main className="login-shell" data-testid="office-auth-gate">
        <section className="login-card">
          <p className="meta" style={{ margin: 0 }}>
            Checking workspace access…
          </p>
          <p className="meta">
            If this stays here, open <a href="/login">sign in</a> and continue to the workspace.
          </p>
        </section>
      </main>
    );
  }

  return children;
}
