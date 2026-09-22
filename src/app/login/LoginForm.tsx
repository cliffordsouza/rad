"use client";

import { useState } from "react";

export default function LoginForm({ devAuth, domain }: { devAuth: boolean; domain: string }) {
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function devLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch("/api/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      window.location.href = "/portal";
    } else {
      const d = await res.json().catch(() => ({}));
      setErr(d.error || "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <a
        href="/api/auth/google"
        className="rad-btn"
        style={{ justifyContent: "center", padding: "12px 16px" }}
      >
        Sign in with Google
      </a>

      {devAuth && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontSize: 12 }}>
            <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
            or dev sign-in (local)
            <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>
          <form onSubmit={devLogin} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              className="rad-input"
              type="email"
              placeholder={`you@${domain}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" className="rad-btn rad-btn-ghost" disabled={busy} style={{ justifyContent: "center" }}>
              {busy ? "Signing in..." : "Dev sign in"}
            </button>
          </form>
        </>
      )}

      {err && <div style={{ color: "var(--danger)", fontSize: 13 }}>{err}</div>}
    </div>
  );
}
