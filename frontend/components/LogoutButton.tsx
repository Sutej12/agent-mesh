"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { logoutSession } from "@/lib/api";

export function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logout = async () => {
    setBusy(true);
    setError(null);
    try {
      await logoutSession();
      router.replace("/login");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign out");
      setBusy(false);
    }
  };

  return (
    <span className="logout-control">
      <button
        type="button"
        className={`px-btn ghost logout-button ${className}`.trim()}
        disabled={busy}
        aria-busy={busy}
        onClick={() => void logout()}
      >
        <LogOut size={16} aria-hidden />
        <span>{busy ? "Signing out…" : "Log out"}</span>
      </button>
      {error ? (
        <span className="logout-error" role="status" aria-live="polite">
          {error}
        </span>
      ) : null}
    </span>
  );
}
