"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface HistoryEntry {
  id: string;
  extractedCode: string | null;
  matchStatus: "matched" | "unmapped" | "invalid_payload";
  createdAt: string;
  internalSystem: string | null;
  severity: string | null;
  escalateToDev: boolean | null;
}

const STATUS_STYLES: Record<HistoryEntry["matchStatus"], string> = {
  matched: "bg-green-100 text-green-800",
  unmapped: "bg-slate-200 text-slate-700",
  invalid_payload: "bg-red-100 text-red-800",
};

export function HistoryPanel({ refreshKey }: { refreshKey: number }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/history?limit=20");
      const json = await res.json();
      if (res.ok) {
        setEntries(json.history ?? []);
      }
    } catch {
      // History load failure is non-critical; leave the list as-is.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadHistory();
    }
  }, [open, refreshKey, loadHistory]);

  async function handleDelete(id: string) {
    setDeleteError(null);
    const previous = entries;
    // Optimistic removal.
    setEntries((current) => current.filter((e) => e.id !== id));

    try {
      const res = await fetch(`/api/history/${id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error("Delete failed");
      }
    } catch {
      setEntries(previous);
      setDeleteError("Couldn't delete that entry. Please try again.");
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-700"
      >
        Recent history
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {open && (
        <div className="border-t border-slate-200 px-4 py-3">
          {deleteError && (
            <p className="mb-2 text-xs text-red-600">{deleteError}</p>
          )}

          {loading && entries.length === 0 && (
            <p className="text-sm text-slate-500">Loading...</p>
          )}

          {!loading && entries.length === 0 && (
            <p className="text-sm text-slate-500">No history yet.</p>
          )}

          <ul className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-xs text-slate-700">
                      {entry.extractedCode ?? "(no code found)"}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase",
                        STATUS_STYLES[entry.matchStatus]
                      )}
                    >
                      {entry.matchStatus}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(entry.id)}
                  className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Delete history entry"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
