"use client";

import { useState } from "react";

type Tab = "message" | "poll" | "image";

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: "8px 14px",
  borderRadius: 999,
  border: "1px solid " + (active ? "transparent" : "var(--border)"),
  background: active ? "var(--accent)" : "var(--surface)",
  color: active ? "#fff" : "var(--text)",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  transition: "background 150ms var(--ease)",
});

export default function Compose({
  canMessage, canPoll, flash, onPosted,
}: {
  canMessage: boolean; canPoll: boolean;
  flash: (m: string) => void; onPosted: () => void;
}) {
  const first: Tab = canMessage ? "message" : "poll";
  const [tab, setTab] = useState<Tab>(first);
  const [target, setTarget] = useState<"test" | "live">("test");
  const [busy, setBusy] = useState(false);

  const [text, setText] = useState("");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [imageUrl, setImageUrl] = useState("");
  const [caption, setCaption] = useState("");

  async function post(payload: any) {
    setBusy(true);
    const res = await fetch("/api/compose", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, target }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return flash(d.error || "Failed to post");
    flash(`Posted to ${d.channel}`);
    setText(""); setQuestion(""); setOptions(["", ""]); setImageUrl(""); setCaption("");
    onPosted();
  }

  return (
    <div className="rad-card rad-rise">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Compose</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span style={{ color: "var(--muted)" }}>Post to</span>
          <select className="rad-select" value={target} onChange={(e) => setTarget(e.target.value as any)} style={{ padding: "6px 10px" }}>
            <option value="test">Test channel</option>
            <option value="live">Live channel</option>
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {canMessage && <button style={tabStyle(tab === "message")} onClick={() => setTab("message")}>💬 Message</button>}
        {canPoll && <button style={tabStyle(tab === "poll")} onClick={() => setTab("poll")}>📊 Poll</button>}
        {canMessage && <button style={tabStyle(tab === "image")} onClick={() => setTab("image")}>🖼️ Image</button>}
      </div>

      {tab === "message" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <textarea className="rad-input" rows={4} placeholder="Write an announcement for the channel..."
            value={text} onChange={(e) => setText(e.target.value)} style={{ resize: "vertical", fontFamily: "inherit" }} />
          <div><button className="rad-btn" disabled={busy || !text.trim()} onClick={() => post({ type: "message", text })}>Post message</button></div>
        </div>
      )}

      {tab === "poll" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input className="rad-input" placeholder="Poll question" value={question} onChange={(e) => setQuestion(e.target.value)} />
          {options.map((o, i) => (
            <div key={i} style={{ display: "flex", gap: 8 }}>
              <input className="rad-input" placeholder={`Option ${i + 1}`} value={o}
                onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} style={{ flex: 1 }} />
              {options.length > 2 && (
                <button className="rad-btn rad-btn-ghost" style={{ padding: "0 12px" }}
                  onClick={() => setOptions(options.filter((_, j) => j !== i))}>✕</button>
              )}
            </div>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            {options.length < 10 && <button className="rad-btn rad-btn-ghost" onClick={() => setOptions([...options, ""])}>+ Add option</button>}
            <button className="rad-btn" disabled={busy || !question.trim() || options.filter((o) => o.trim()).length < 2}
              onClick={() => post({ type: "poll", question, options })}>Post poll</button>
          </div>
        </div>
      )}

      {tab === "image" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input className="rad-input" placeholder="Image URL (https://...)" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
          <input className="rad-input" placeholder="Caption (optional)" value={caption} onChange={(e) => setCaption(e.target.value)} />
          <div><button className="rad-btn" disabled={busy || !imageUrl.trim()} onClick={() => post({ type: "image", url: imageUrl, caption })}>Post image</button></div>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Paste an image link for now. Direct file upload is coming once RAD gets the files scope.</div>
        </div>
      )}
    </div>
  );
}
