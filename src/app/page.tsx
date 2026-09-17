import { RAD_PERSONA } from "@/config/persona";

function StatusRow({ label, ok, note }: { label: string; ok: boolean; note: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 18px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>{note}</div>
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          padding: "4px 10px",
          borderRadius: 999,
          background: ok ? "rgba(53,196,106,0.12)" : "rgba(232,176,75,0.12)",
          color: ok ? "var(--ok)" : "var(--pending)",
        }}
      >
        {ok ? "READY" : "PENDING"}
      </span>
    </div>
  );
}

export default function Home() {
  const has = (v?: string) => Boolean(v && v.length > 0);

  const checks = [
    {
      label: "Anthropic (Rad's brain)",
      ok: has(process.env.ANTHROPIC_API_KEY),
      note: "Powers conversational answers",
    },
    {
      label: "Slack app",
      ok: has(process.env.SLACK_BOT_TOKEN),
      note: "Bot token for posting & DMs (Phase 1)",
    },
    {
      label: "Confluence Cloud",
      ok: has(process.env.CONFLUENCE_API_TOKEN),
      note: process.env.CONFLUENCE_BASE_URL || "Not configured",
    },
    {
      label: "Google Drive folder",
      ok: has(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      note: "Context source (docs) - shared later",
    },
    {
      label: "People sheet",
      ok: has(process.env.GOOGLE_PEOPLE_SHEET_ID),
      note: "Birthdays / anniversaries / joiners - shared later",
    },
  ];

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
        <div style={{ fontSize: 40 }}>{RAD_PERSONA.emoji}</div>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Rad</h1>
          <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>{RAD_PERSONA.tagline}</p>
        </div>
      </div>

      <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6, marginTop: 24 }}>
        This is Rad&apos;s admin & status surface. The HR config portal (sources,
        target channel, event toggles, tone) lands in Phase 5. For now, here&apos;s
        what&apos;s wired up.
      </p>

      <div
        style={{
          marginTop: 24,
          border: "1px solid var(--border)",
          borderRadius: 14,
          background: "var(--card)",
          overflow: "hidden",
        }}
      >
        {checks.map((c) => (
          <StatusRow key={c.label} {...c} />
        ))}
      </div>

      <a
        href="/portal"
        style={{
          display: "inline-block", marginTop: 24, padding: "11px 18px", borderRadius: 10,
          background: "var(--accent)", color: "#fff", fontWeight: 600, textDecoration: "none",
        }}
      >
        Open the RAD Portal →
      </a>
    </main>
  );
}
