"use client";

import { useState } from "react";
import { AlertTriangle, ListChecks, Wrench, Send } from "lucide-react";
import { SeverityBadge } from "@/app/components/SeverityBadge";
import { CopyButton } from "@/app/components/CopyButton";
import { HistoryPanel } from "@/app/components/HistoryPanel";

const MAX_CHARS = 20000;

type Severity = "low" | "medium" | "high" | "critical";

interface MatchedResult {
  status: "matched";
  errorCode: string;
  internalSystem: string;
  severity: Severity;
  isSelfService: boolean;
  selfServiceSteps: string | null;
  specialistDiagnostic: string;
  employeeMessage: string;
  escalateToDev: boolean;
  historyId: string | null;
}

interface UnmappedResult {
  status: "unmapped";
  errorCode: string;
  specialistDiagnostic: null;
  employeeMessage: null;
  historyId: string | null;
}

type ParseResult = MatchedResult | UnmappedResult;

export default function HomePage() {
  const [payload, setPayload] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const charCount = payload.length;
  const overLimit = charCount > MAX_CHARS;

  async function handleParse() {
    setLoading(true);
    setErrorMessage(null);
    setResult(null);

    try {
      const res = await fetch("/api/parse-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      const json = await res.json();

      if (!res.ok) {
        setErrorMessage(json.message ?? "Something went wrong. Please try again.");
        return;
      }

      setResult(json as ParseResult);
      setHistoryRefreshKey((k) => k + 1);
    } catch {
      setErrorMessage("Couldn't reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Plain Logger</h1>
        <p className="mt-1 text-sm text-slate-500">
          Paste a raw internal error log to get a specialist diagnostic and an
          employee-ready explanation.
        </p>
      </header>

      {/* Input panel */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <label
          htmlFor="log-payload"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          Raw JSON error log
        </label>
        <textarea
          id="log-payload"
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          rows={8}
          placeholder='{"error_code": "AUTHSVC_TOKEN_EXPIRED", "service": "auth-service"}'
          className="w-full rounded-md border border-slate-300 p-3 font-mono text-sm focus:border-slate-500 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <span
            className={`text-xs ${overLimit ? "text-red-600" : "text-slate-400"}`}
          >
            {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters
          </span>
          <button
            type="button"
            onClick={handleParse}
            disabled={loading || payload.trim().length === 0 || overLimit}
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Send size={16} />
            {loading ? "Parsing..." : "Parse Log"}
          </button>
        </div>

        {errorMessage && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </section>

      {/* Output panel */}
      {result && result.status === "matched" && (
        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                <Wrench size={16} /> Specialist Diagnostic
              </h2>
              <CopyButton text={result.specialistDiagnostic} />
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-xs font-medium text-amber-800">
                {result.internalSystem}
              </span>
              <SeverityBadge severity={result.severity} />
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  result.escalateToDev
                    ? "bg-red-100 text-red-700"
                    : "bg-green-100 text-green-700"
                }`}
              >
                {result.escalateToDev ? "Escalate to dev" : "Do not escalate"}
              </span>
            </div>
            <p className="text-sm text-amber-950">{result.specialistDiagnostic}</p>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-blue-900">
                Employee-Facing Message
              </h2>
              <CopyButton
                text={
                  result.isSelfService && result.selfServiceSteps
                    ? `${result.employeeMessage}\n\n${result.selfServiceSteps}`
                    : result.employeeMessage
                }
              />
            </div>
            <p className="text-sm text-blue-950">{result.employeeMessage}</p>

            {result.isSelfService && result.selfServiceSteps && (
              <div className="mt-3 rounded-md border border-blue-200 bg-white p-3">
                <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-blue-800">
                  <ListChecks size={14} /> Steps to try
                </h3>
                <p className="text-sm text-slate-700">{result.selfServiceSteps}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {result && result.status === "unmapped" && (
        <section className="mt-6 rounded-lg border border-slate-300 bg-slate-50 p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <AlertTriangle size={16} /> Unrecognized error code
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            The code{" "}
            <span className="font-mono text-slate-800">
              {result.errorCode || "(no code found)"}
            </span>{" "}
            isn&apos;t in the known-errors table yet. It&apos;s been logged so
            the platform team can add it later.
          </p>
        </section>
      )}

      {/* History panel */}
      <section className="mt-8">
        <HistoryPanel refreshKey={historyRefreshKey} />
      </section>
    </main>
  );
}
