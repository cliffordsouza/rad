"use client";

import { useEffect, useState, useCallback } from "react";

const ICON: Record<string, string> = { message: "💬", poll: "📊", image: "🖼️" };

function ago(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function Sent({ refreshKey }: { refreshKey: number }) {
  const [sent, setSent] = useState<any[]>([]);

  const load = useCallback(async () => {
    const d = await fetch("/api/sent").then((x) => x.json()).catch(() => ({ sent: [] }));
    setSent(d.sent || []);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div className="rad-card rad-rise">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Sent</h2>
        <button className="rad-btn rad-btn-ghost" onClick={load}>Refresh</button>
      </div>
      {sent.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13 }}>Nothing sent yet.</div>}
      {sent.map((s) => (
        <div key={s.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <div style={{ fontSize: 14 }}>
              <span style={{ marginRight: 8 }}>{ICON[s.type] || "•"}</span>
              <b>{s.summary || s.type}</b>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, whiteSpace: "nowrap" }}>{ago(s.at)}</div>
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 3 }}>
            {s.channel} · by {s.by.split("@")[0]}{!s.live && s.channel ? " · test" : ""}
          </div>
          {s.poll && (
            <div style={{ marginTop: 8, paddingLeft: 26 }}>
              {s.poll.options.map((o: any, i: number) => {
                const max = Math.max(1, ...s.poll.options.map((x: any) => x.count));
                const pct = Math.round((o.count / max) * 100);
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, margin: "3px 0" }}>
                    <div style={{ width: 150, fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</div>
                    <div style={{ flex: 1, background: "var(--surface-2)", borderRadius: 999, height: 10, border: "1px solid var(--border)", overflow: "hidden" }}>
                      <div className="rad-barfill" style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", borderRadius: 999 }} />
                    </div>
                    <div style={{ width: 22, textAlign: "right", fontSize: 12, fontWeight: 600 }}>{o.count}</div>
                  </div>
                );
              })}
              <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 4 }}>{s.poll.totalVotes} vote{s.poll.totalVotes === 1 ? "" : "s"}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
