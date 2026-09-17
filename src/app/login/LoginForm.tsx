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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <a
        href="/api/auth/google"
        style={{
          display: "block", textAlign: "center", padding: "12px 16px", borderRadius: 10,
          background: "#fff", color: "#111", fontWeight: 600, textDecoration: "none",
        }}
      >
        Sign in with Google
      </a>

      {devAuth && (
        <>
          <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 12 }}>or dev sign-in (local)</div>
          <form onSubmit={devLogin} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              type="email"
              placeholder={`you@${domain}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)",
                background: "var(--bg)", color: "var(--text)",
              }}
            />
            <button
              type="submit"
              disabled={busy}
              style={{
                padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                background: "var(--accent)", color: "#fff", fontWeight: 600,
              }}
            >
              {busy ? "Signing in..." : "Dev sign in"}
            </button>
          </form>
        </>
      )}

      {err && <div style={{ color: "#ff6b6b", fontSize: 13 }}>{err}</div>}
    </div>
  );
}
