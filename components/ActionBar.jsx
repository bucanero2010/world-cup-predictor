"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatKickoff } from "@/lib/time.js";

function lastUpdatedLabel(iso) {
  if (!iso) return "never";
  return formatKickoff(iso); // "Thu 11 Jun, HH:MM TZ" in Madrid
}

export default function ActionBar({ meta, credits }) {
  const router = useRouter();
  const [busy, setBusy] = useState(null); // "odds" | "results" | null
  const [msg, setMsg] = useState(null);

  async function run(kind, path) {
    setBusy(kind);
    setMsg(null);
    try {
      const res = await fetch(path, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        if (kind === "odds") {
          setMsg(`Odds refreshed (${data.updated}).`);
        } else {
          const skipped = data.skipped
            ? `, ${data.skipped} skipped (finished before first odds refresh)`
            : "";
          setMsg(`Results updated (${data.closed}${skipped}).`);
        }
        router.refresh(); // re-fetch the server component's DB data
      } else if (res.status === 429) {
        setMsg(`Try again in ${Math.ceil((data.retryAfterMs ?? 0) / 1000)}s`);
      } else {
        setMsg(data.error || "Action failed");
      }
    } catch {
      setMsg("Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="actionbar">
      <div className="actionbtns">
        <button
          className="primary"
          disabled={busy !== null}
          onClick={() => run("odds", "/api/refresh-odds")}
        >
          {busy === "odds" ? "Refreshing…" : "Refresh odds"}
        </button>
        <button
          className="secondary"
          disabled={busy !== null}
          onClick={() => run("results", "/api/update-results")}
        >
          {busy === "results" ? "Updating…" : "Update results"}
        </button>
      </div>
      <div className="actionmeta">
        <span>odds: {lastUpdatedLabel(meta?.oddsLastRefreshed)}</span>
        <span>results: {lastUpdatedLabel(meta?.resultsLastUpdated)}</span>
        {Array.isArray(credits) && credits.length > 0 && (
          <span className="credits">
            credits:{" "}
            {credits.map((c, i) => (
              <span key={c.keyIndex} className={c.remaining <= 50 ? "cred-low" : ""}>
                {i > 0 && " / "}
                {c.keyIndex === 0 ? "primary" : "backup"} {c.remaining}
              </span>
            ))}
          </span>
        )}
        {msg && <span className="actionmsg">{msg}</span>}
      </div>
    </div>
  );
}
