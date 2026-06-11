"use client";

import { useState } from "react";

export default function RefreshButton({ eventId, onRefreshed }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function refresh() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/matches/${eventId}/refresh`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        onRefreshed?.(data.match);
      } else if (res.status === 429) {
        const secs = Math.ceil((data.retryAfterMs ?? 0) / 1000);
        setMsg(`Try again in ${secs}s`);
      } else {
        setMsg(data.error || "Refresh failed");
      }
    } catch {
      setMsg("Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="refresh">
      <button onClick={refresh} disabled={busy} className="refreshbtn">
        {busy ? "…" : "↻"}
      </button>
      {msg && <span className="refreshmsg">{msg}</span>}
    </span>
  );
}
