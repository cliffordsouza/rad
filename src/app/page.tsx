import { redirect } from "next/navigation";
import { getUser } from "@/lib/session";
import { RAD_PERSONA } from "@/config/persona";

export const dynamic = "force-dynamic";

function StatusRow({ label, ok, note }: { label: string; ok: boolean; note: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 18px", borderBottom: "1px solid var(--border)",
    }}>
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>{note}</div>
      </div>
      <span className="rad-pill" style={{
        background: ok ? "var(--ok-weak)" : "var(--pending-weak)",
        color: ok ? "var(--ok)" : "var(--pending)",
      }}>{ok ? "Ready" : "Pending"}</span>
    </div>
  );
}

export default async function Home() {
  const user = await getUser();
  if (!user) redirect("/login");

  const has = (v?: string) => Boolean(v && v.length > 0);

  const checks = [
    { label: "Anthropic (RAD's brain)", ok: has(process.env.ANTHROPIC_API_KEY), note: "Powers conversational answers" },
    { label: "Slack app", ok: has(process.env.SLACK_BOT_TOKEN), note: "Bot token for posting & DMs" },
    { label: "Confluence Cloud", ok: has(process.env.CONFLUENCE_API_TOKEN), note: process.env.CONFLUENCE_BASE_URL || "Not configured" },
    { label: "Google Drive folder", ok: has(process.env.GOOGLE_SERVICE_ACCOUNT_JSON), note: "Context source (docs)" },
    { label: "People sheet", ok: has(process.env.GOOGLE_PEOPLE_SHEET_ID), note: "Birthdays / anniversaries / joiners" },
  ];

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
        <img src="/brand/rad-avatar.png" alt="RAD" width={48} height={48} style={{ borderRadius: 12, boxShadow: "var(--shadow-sm)" }} />
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>RAD</h1>
          <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>{RAD_PERSONA.tagline}</p>
        </div>
      </div>

      <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6, marginTop: 24 }}>
        RAD&apos;s status surface. Manage notifications, polls and access in the portal.
      </p>

      <div className="rad-card" style={{ padding: 0, overflow: "hidden", marginTop: 20 }}>
        {checks.map((c) => (
          <StatusRow key={c.label} {...c} />
        ))}
      </div>

      <a href="/portal" className="rad-btn" style={{ marginTop: 24, padding: "12px 18px" }}>
        Open the RAD Portal →
      </a>
    </main>
  );
}
