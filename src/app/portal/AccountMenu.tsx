"use client";

import { useEffect, useRef, useState } from "react";

const ROLE_LABEL: Record<string, string> = { admin: "Admin", manager: "Manager", viewer: "Viewer" };

export default function AccountMenu({
  email, role, name, picture,
}: {
  email: string; role: string; name?: string; picture?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = (name?.trim()?.[0] || email[0] || "?").toUpperCase();

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account"
        style={{
          width: 40, height: 40, borderRadius: "50%", overflow: "hidden",
          border: "1px solid var(--border)", background: "var(--accent)", color: "#fff",
          cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700, fontSize: 16, boxShadow: "var(--shadow-sm)",
          transition: "box-shadow 150ms var(--ease), transform 120ms var(--ease)",
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {picture
          ? <img src={picture} alt="" width={40} height={40} referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : initial}
      </button>

      {open && (
        <div
          className="rad-rise"
          style={{
            position: "absolute", right: 0, top: 48, width: 236, zIndex: 20,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 12, boxShadow: "var(--shadow)", overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, borderBottom: "1px solid var(--border)" }}>
            <div style={{
              width: 38, height: 38, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
              background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center",
              justifyContent: "center", fontWeight: 700,
            }}>
              {picture
                ? <img src={picture} alt="" width={38} height={38} referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : initial}
            </div>
            <div style={{ minWidth: 0 }}>
              {name ? <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div> : null}
              <div style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</div>
              <span className="rad-pill" style={{ background: "var(--accent-weak)", color: "var(--accent)", marginTop: 4, display: "inline-block" }}>{ROLE_LABEL[role] || role}</span>
            </div>
          </div>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              style={{
                width: "100%", textAlign: "left", padding: "11px 14px", border: "none",
                background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 14,
                font: "inherit", fontWeight: 500,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
