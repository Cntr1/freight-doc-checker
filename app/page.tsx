"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, RotateCcw, Ship, Anchor } from "lucide-react";
import { UploadZone } from "@/components/upload-zone";
import { ResultsPanel } from "@/components/results-panel";
import { DOCUMENT_TYPES, type ComparisonResult } from "@/lib/types";

export default function Home() {
  const [files, setFiles] = useState<Record<string, File>>({});
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadedCount = Object.keys(files).length;
  const canCompare = uploadedCount >= 2;

  const handleFileChange = (key: string, file: File) => {
    setFiles((prev) => ({ ...prev, [key]: file }));
    setResult(null);
    setError(null);
  };

  const handleRemove = (key: string) => {
    setFiles((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setResult(null);
  };

  const handleCompare = async () => {
    if (!canCompare) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress("Uploading documents...");

    try {
      const formData = new FormData();
      for (const [key, file] of Object.entries(files)) {
        formData.append(key, file);
        const label = DOCUMENT_TYPES.find((d) => d.key === key)?.label || key;
        formData.append(`${key}_label`, label);
      }

      setProgress("AI is reading your documents...");

      const res = await fetch("/api/compare", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Server error ${res.status}`);
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  const handleReset = () => {
    setFiles({});
    setResult(null);
    setError(null);
    setProgress("");
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-surface-0/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-emerald-700 shadow-[0_0_20px_var(--color-accent)/15]">
              <Anchor size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-[15px] font-bold tracking-tight">Freight Doc Checker</h1>
              <p className="font-mono text-[10px] text-text-faint">
                AI-powered shipping document verification
              </p>
            </div>
          </div>

          <AnimatePresence>
            {(result || uploadedCount > 0) && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={handleReset}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:border-border-subtle hover:text-text-secondary"
              >
                <RotateCcw size={12} />
                New Check
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-6">
        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-5"
            >
              {/* Instructions */}
              <div>
                <h2 className="text-sm font-semibold text-text-secondary">
                  Upload Documents to Compare
                </h2>
                <p className="mt-1 text-xs text-text-faint">
                  Upload at least 2 documents. The AI will cross-reference every field and flag
                  any discrepancies between them.
                </p>
              </div>

              {/* Upload Grid */}
              <div className="grid grid-cols-2 gap-3">
                {DOCUMENT_TYPES.map((dt) => (
                  <UploadZone
                    key={dt.key}
                    docType={dt}
                    file={files[dt.key] || null}
                    onFileChange={(f) => handleFileChange(dt.key, f)}
                    onRemove={() => handleRemove(dt.key)}
                  />
                ))}
              </div>

              {/* Compare Button */}
              <button
                onClick={handleCompare}
                disabled={!canCompare || loading}
                className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold transition-all ${
                  canCompare && !loading
                    ? "bg-gradient-to-r from-accent to-emerald-600 text-white shadow-[0_4px_24px_var(--color-accent)/20] hover:shadow-[0_4px_32px_var(--color-accent)/30] cursor-pointer"
                    : "bg-surface-2 text-text-faint cursor-not-allowed"
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {progress}
                  </>
                ) : (
                  <>
                    <Ship size={16} />
                    Compare Documents
                    {!canCompare && (
                      <span className="ml-1 text-[11px] font-normal opacity-60">
                        — upload at least 2
                      </span>
                    )}
                  </>
                )}
              </button>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-xl border border-critical-border bg-critical-muted px-4 py-3 text-sm text-critical-text"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <ResultsPanel result={result} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
