"use client";

import { useEffect, useState } from "react";

import { isWorkspaceAuthed } from "@/lib/api";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * True once the visitor has a Supabase session, or the development fallback has
 * granted local workspace access. This controls marketing navigation only; protected
 * pages are authorized by the Next proxy and FastAPI JWT verification.
 */
export function useWorkspaceAuthed(): boolean {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        return;
      }
      void supabase.auth.getSession().then(({ data }) => setAuthed(Boolean(data.session)));
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        setAuthed(Boolean(session));
      });
      return () => data.subscription.unsubscribe();
    }

    const sync = () => setAuthed(isWorkspaceAuthed());
    sync();
    // Keep other open tabs in step when someone logs in or out.
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  return authed;
}
