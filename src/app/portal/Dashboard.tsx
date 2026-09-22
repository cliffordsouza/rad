"use client";

import { useEffect, useState, useCallback } from "react";

type Perm = string;
const has = (perms: Perm[], p: Perm) => perms.includes(p);

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  viewer: "Viewer",
};

function Bar({ value, max, label, showValue = true }: { value: number; max: number; label: string; showValue?: boolean }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "6px 0" }}>
      <div style={{ width: 200, fontSize: 13, color: "var(--muted)" }}>{label}</div>
      <div style={{ flex: 1, background: "var(--surface-2)", borderRadius: 999, height: 14, overflow: "hidden", border: "1px solid var(--border)" }}>
        <div className="rad-barfill" style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", borderRadius: 999 }} />
      </div>
      {showValue && <div style={{ width: 36, textAlign: "right", fontSize: 13, fontWeight: 600 }}>{value}</div>}
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rad-card rad-rise">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{title}</h2>
        {right}
      </div>
      {children}
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
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }),
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
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: newEmail, role: newRole }),
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
  const live = config?.postingEnabled;

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 90px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 26 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src="/brand/rad-avatar.png" alt="RAD" width={46} height={46}
            style={{ borderRadius: 12, boxShadow: "var(--shadow-sm)" }} />
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>RAD Portal</h1>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>
              {email} · <span style={{ color: "var(--accent)", fontWeight: 600 }}>{ROLE_LABEL[role] || role}</span>
            </div>
          </div>
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="rad-btn rad-btn-ghost">Sign out</button>
        </form>
      </div>

      {/* Status */}
      {config && (
        <div className="rad-card rad-rise" style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          borderLeft: `4px solid ${live ? "var(--ok)" : "var(--pending)"}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="rad-pill" style={{
              background: live ? "var(--ok-weak)" : "var(--pending-weak)",
              color: live ? "var(--ok)" : "var(--pending)",
            }}>{live ? "Live" : "Test mode"}</span>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              {live ? `Posts go to ${config.socialChannel}` : `Routing to ${config.testChannel} - real audience is off`}
            </div>
          </div>
          {has(perms, "manage_config") && (
            <button className={`rad-btn ${live ? "rad-btn-ghost" : ""}`} onClick={() => saveConfig({ postingEnabled: !live })}>
              {live ? "Switch to test" : "Go live"}
            </button>
          )}
        </div>
      )}

      {/* Send */}
      {(has(perms, "run_polls") || has(perms, "trigger_posts")) && (
        <Section title="Send">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {has(perms, "run_polls") && <button className="rad-btn" onClick={() => trigger("pulse", "pulse check")}>Pulse check</button>}
            {has(perms, "run_polls") && <button className="rad-btn" onClick={() => trigger("townhall", "town-hall survey")}>Town-hall survey</button>}
            {has(perms, "trigger_posts") && <button className="rad-btn rad-btn-ghost" onClick={() => trigger("celebration", "celebrations")}>Post today&apos;s celebrations</button>}
          </div>
        </Section>
      )}

      {/* Results */}
      {has(perms, "view_results") && (
        <Section title="Results" right={<button className="rad-btn rad-btn-ghost" onClick={loadAll}>Refresh</button>}>
          {pulse && pulse.count > 0 && (
            <div style={{ marginBottom: townhall && townhall.respondents > 0 ? 22 : 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Pulse · {pulse.question}</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>
                {pulse.count} responses · average {pulse.average} / 5
              </div>
              {["😞 Rough", "🙁 Meh", "😐 OK", "🙂 Good", "😄 Great"].map((lbl, i) => (
                <Bar key={i} label={lbl} value={pulse.distribution[i]} max={Math.max(1, ...pulse.distribution)} />
              ))}
              {pulse.responses?.filter((r: any) => r.comment).length > 0 && (
                <div style={{ marginTop: 12, fontSize: 13, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  {pulse.responses.filter((r: any) => r.comment).map((r: any, i: number) => (
                    <div key={i} style={{ color: "var(--muted)", marginBottom: 4 }}>💬 <b style={{ color: "var(--text)" }}>{r.name}</b>: {r.comment}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          {townhall && townhall.respondents > 0 && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Town hall</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>{townhall.respondents} respondents · out of 5</div>
              {townhall.pointers.map((p: any, i: number) => (
                <Bar key={i} label={p.label} value={p.average} max={5} />
              ))}
            </div>
          )}
          {(!pulse || pulse.count === 0) && (!townhall || townhall.respondents === 0) && (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>No responses yet - send a poll to get started.</div>
          )}
        </Section>
      )}

      {/* Access */}
      {has(perms, "manage_roles") && (
        <Section title="Access">
          <div style={{ marginBottom: 14 }}>
            {Object.entries(roles).map(([e, r]) => (
              <div key={e} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                fontSize: 14, padding: "9px 0", borderBottom: "1px solid var(--border)",
              }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {e}
                  <span className="rad-pill" style={{ background: "var(--accent-weak)", color: "var(--accent)" }}>{ROLE_LABEL[r] || r}</span>
                </span>
                {e !== email && (
                  <button className="rad-btn rad-btn-ghost" style={{ padding: "5px 11px", fontSize: 12 }} onClick={() => removeRole(e)}>Remove</button>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="rad-input" placeholder="name@radix.email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
              style={{ flex: 1, minWidth: 190 }} />
            <select className="rad-select" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              <option value="viewer">Viewer · see results</option>
              <option value="manager">Manager · send + results</option>
              <option value="admin">Admin · everything</option>
            </select>
            <button className="rad-btn" onClick={addRole}>Add / update</button>
          </div>
        </Section>
      )}

      {/* Channels */}
      {has(perms, "manage_config") && config && (
        <Section title="Channels">
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, color: "var(--muted)" }}>Live channel</label>
              <input className="rad-input" defaultValue={config.socialChannel} onBlur={(e) => saveConfig({ socialChannel: e.target.value })} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, color: "var(--muted)" }}>Test channel</label>
              <input className="rad-input" defaultValue={config.testChannel} onBlur={(e) => saveConfig({ testChannel: e.target.value })} />
            </div>
          </div>
        </Section>
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%",
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
          padding: "11px 18px", fontSize: 14, boxShadow: "var(--shadow)",
          animation: "rad-toast 220ms var(--ease) both",
        }}>{toast}</div>
      )}
    </main>
  );
}
