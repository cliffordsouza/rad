"use client";

import { useEffect, useState, useCallback } from "react";

type Perm = string;
const has = (perms: Perm[], p: Perm) => perms.includes(p);

const card: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 14, background: "var(--card)",
  padding: 20, marginBottom: 18,
};
const btn: React.CSSProperties = {
  padding: "9px 14px", borderRadius: 8, border: "none", cursor: "pointer",
  background: "var(--accent)", color: "#fff", fontWeight: 600, fontSize: 14,
};
const ghost: React.CSSProperties = {
  ...btn, background: "transparent", color: "var(--text)", border: "1px solid var(--border)",
};

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
      <div style={{ width: 190, fontSize: 13, color: "var(--muted)" }}>{label}</div>
      <div style={{ flex: 1, background: "var(--bg)", borderRadius: 6, height: 16, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)" }} />
      </div>
      <div style={{ width: 34, textAlign: "right", fontSize: 13 }}>{value}</div>
    </div>
  );
}

export default function Dashboard({ email, role, perms }: { email: string; role: string; perms: Perm[] }) {
  const [config, setConfig] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [toast, setToast] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("viewer");

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  const loadAll = useCallback(async () => {
    const [c, r, rl] = await Promise.all([
      fetch("/api/config").then((x) => x.json()).catch(() => ({})),
      has(perms, "view_results") ? fetch("/api/results").then((x) => x.json()).catch(() => ({})) : Promise.resolve(null),
      has(perms, "manage_roles") ? fetch("/api/roles").then((x) => x.json()).catch(() => ({})) : Promise.resolve(null),
    ]);
    if (c?.config) setConfig(c.config);
    if (r) setResults(r);
    if (rl?.roles) setRoles(rl.roles);
  }, [perms]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function trigger(type: string, label: string) {
    flash(`Sending ${label}...`);
    const res = await fetch("/api/trigger", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return flash(d.error || "Failed");
    if (type === "celebration") flash(d.posted ? `Posted to ${d.channel}` : d.message);
    else flash(`${label} sent to ${d.sent} ${d.sent === 1 ? "person" : "people"} (${d.live ? "live" : "test mode"})`);
    setTimeout(loadAll, 800);
  }

  async function saveConfig(patch: any) {
    const res = await fetch("/api/config", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) { setConfig(d.config); flash("Settings saved"); } else flash(d.error || "Failed");
  }

  async function addRole() {
    const res = await fetch("/api/roles", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail, role: newRole }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) { setRoles(d.roles); setNewEmail(""); flash("Access updated"); } else flash(d.error || "Failed");
  }
  async function removeRole(e: string) {
    const res = await fetch("/api/roles", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: e }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) setRoles(d.roles); else flash(d.error || "Failed");
  }

  const pulse = results?.pulse;
  const townhall = results?.townhall;

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "36px 20px 80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 30 }}>🦦</span>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>RAD Portal</h1>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>{email} · <b>{role}</b></div>
          </div>
        </div>
        <form action="/api/auth/logout" method="post"><button style={ghost}>Sign out</button></form>
      </div>

      {config && (
        <div style={{
          ...card, display: "flex", justifyContent: "space-between", alignItems: "center",
          borderColor: config.postingEnabled ? "var(--ok)" : "var(--pending)",
        }}>
          <div>
            <b>{config.postingEnabled ? "LIVE" : "Test mode"}</b>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>
              {config.postingEnabled
                ? `Posts go to ${config.socialChannel}`
                : `Everything routes to ${config.testChannel} - real audience is off`}
            </div>
          </div>
          {has(perms, "manage_config") && (
            <button style={btn} onClick={() => saveConfig({ postingEnabled: !config.postingEnabled })}>
              {config.postingEnabled ? "Switch to test" : "Go live"}
            </button>
          )}
        </div>
      )}

      {(has(perms, "run_polls") || has(perms, "trigger_posts")) && (
        <div style={card}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Send</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {has(perms, "run_polls") && <button style={btn} onClick={() => trigger("pulse", "pulse check")}>Pulse check</button>}
            {has(perms, "run_polls") && <button style={btn} onClick={() => trigger("townhall", "town-hall survey")}>Town-hall survey</button>}
            {has(perms, "trigger_posts") && <button style={ghost} onClick={() => trigger("celebration", "celebrations")}>Post today&apos;s celebrations</button>}
          </div>
        </div>
      )}

      {has(perms, "view_results") && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Results</h2>
            <button style={ghost} onClick={loadAll}>Refresh</button>
          </div>
          {pulse && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Pulse - {pulse.question}</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 8 }}>
                {pulse.count} responses · avg {pulse.average} / 5
              </div>
              {["😞 Rough", "🙁 Meh", "😐 OK", "🙂 Good", "😄 Great"].map((lbl, i) => (
                <Bar key={i} label={lbl} value={pulse.distribution[i]} max={Math.max(1, ...pulse.distribution)} />
              ))}
              {pulse.responses?.filter((r: any) => r.comment).length > 0 && (
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  {pulse.responses.filter((r: any) => r.comment).map((r: any, i: number) => (
                    <div key={i} style={{ color: "var(--muted)" }}>💬 <b>{r.name}</b>: {r.comment}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          {townhall && townhall.respondents > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Town hall</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 8 }}>{townhall.respondents} respondents</div>
              {townhall.pointers.map((p: any, i: number) => (
                <Bar key={i} label={p.label} value={p.average} max={5} />
              ))}
            </div>
          )}
          {(!pulse || pulse.count === 0) && (!townhall || townhall.respondents === 0) && (
            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 12 }}>No responses yet.</div>
          )}
        </div>
      )}

      {has(perms, "manage_roles") && (
        <div style={card}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Access</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {Object.entries(roles).map(([e, r]) => (
              <div key={e} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }}>
                <span>{e} · <b style={{ color: "var(--muted)" }}>{r}</b></span>
                {e !== email && <button style={{ ...ghost, padding: "4px 10px", fontSize: 12 }} onClick={() => removeRole(e)}>Remove</button>}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input placeholder="name@radix.email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
              style={{ flex: 1, minWidth: 180, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }} />
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}>
              <option value="viewer">viewer (see results)</option>
              <option value="manager">manager (send + results)</option>
              <option value="admin">admin (everything)</option>
            </select>
            <button style={btn} onClick={addRole}>Add / update</button>
          </div>
        </div>
      )}

      {has(perms, "manage_config") && config && (
        <div style={card}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Channels</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ fontSize: 13, color: "var(--muted)" }}>Live channel</label>
            <input defaultValue={config.socialChannel} onBlur={(e) => saveConfig({ socialChannel: e.target.value })}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }} />
            <label style={{ fontSize: 13, color: "var(--muted)" }}>Test channel</label>
            <input defaultValue={config.testChannel} onBlur={(e) => saveConfig({ testChannel: e.target.value })}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }} />
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
          padding: "10px 18px", fontSize: 14,
        }}>{toast}</div>
      )}
    </main>
  );
}
