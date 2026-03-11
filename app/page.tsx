"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, RotateCcw, Ship, Anchor, Plus, Trash2, Download, FileCode2,
} from "lucide-react";
import { UploadZone } from "@/components/upload-zone";
import { ResultsPanel } from "@/components/results-panel";
import type { ComparisonResult, HblSlot } from "@/lib/types";

let hblCounter = 0;
function newHblSlot(): HblSlot {
  return { id: `hbl_${++hblCounter}`, file: null };
}

export default function Home() {
  const [hblSlots, setHblSlots] = useState<HblSlot[]>([newHblSlot()]);
  const [mblFile, setMblFile] = useState<File | null>(null);
  const [xmlFile, setXmlFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatingXml, setGeneratingXml] = useState(false);

  const hblCount = hblSlots.filter((s) => s.file !== null).length;
  const canCompare = hblCount >= 1 && (mblFile !== null || xmlFile !== null || hblCount >= 2);
  const canGenerateXml = hblCount >= 1;

  // ── HBL slot management ──────────────────────────────────────────────────

  const setHblFile = (id: string, file: File) => {
    setHblSlots((prev) => prev.map((s) => (s.id === id ? { ...s, file } : s)));
    setResult(null); setError(null);
  };

  const removeHblFile = (id: string) => {
    setHblSlots((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, file: null } : s));
      // Keep at least one slot
      return next.filter((s, i) => s.file !== null || i === 0);
    });
    setResult(null);
  };

  const addHblSlot = () => {
    setHblSlots((prev) => [...prev, newHblSlot()]);
  };

  const removeHblSlot = (id: string) => {
    setHblSlots((prev) => {
      const next = prev.filter((s) => s.id !== id);
      return next.length > 0 ? next : [newHblSlot()];
    });
    setResult(null);
  };

  // ── Compare ──────────────────────────────────────────────────────────────

  const handleCompare = async () => {
    if (!canCompare) return;
    setLoading(true); setError(null); setResult(null);
    setProgress("Uploading documents...");

    try {
      const formData = new FormData();
      formData.append("action", "compare");

      hblSlots.forEach((slot, idx) => {
        if (slot.file) {
          formData.append(`hbl_${idx}`, slot.file);
          formData.append(`hbl_${idx}_label`, `House B/L ${hblSlots.filter(s => s.file).length > 1 ? idx + 1 : ""}`.trim());
        }
      });

      if (mblFile) {
        formData.append("mbl", mblFile);
        formData.append("mbl_label", "Master B/L");
      }
      if (xmlFile) {
        formData.append("xml_file", xmlFile);
      }

      setProgress("AI is reading your documents...");
      const res = await fetch("/api/compare", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false); setProgress("");
    }
  };

  // ── Generate XML ─────────────────────────────────────────────────────────

  const handleGenerateXml = async () => {
    if (!canGenerateXml) return;
    setGeneratingXml(true); setError(null);

    try {
      const formData = new FormData();
      formData.append("action", "generate_xml");

      hblSlots.forEach((slot, idx) => {
        if (slot.file) {
          formData.append(`hbl_${idx}`, slot.file);
          formData.append(`hbl_${idx}_label`, `House B/L ${idx + 1}`);
        }
      });

      if (mblFile) {
        formData.append("mbl", mblFile);
        formData.append("mbl_label", "Master B/L");
      }

      const res = await fetch("/api/compare", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Server error ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Awbolds_export.xml";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "XML generation failed.");
    } finally {
      setGeneratingXml(false);
    }
  };

  // ── Reset ────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setHblSlots([newHblSlot()]);
    setMblFile(null); setXmlFile(null);
    setResult(null); setError(null); setProgress("");
  };

  const hasAnyFile = hblSlots.some((s) => s.file) || mblFile || xmlFile;

  // ── Render ───────────────────────────────────────────────────────────────

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
            {(result || hasAnyFile) && (
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
              className="space-y-6"
            >
              {/* ── House B/Ls section ──────────────────────────────────── */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-text-secondary">House B/Ls</h2>
                    <p className="text-xs text-text-faint">Upload one or more HBLs</p>
                  </div>
                  <button
                    onClick={addHblSlot}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:border-accent hover:text-accent"
                  >
                    <Plus size={12} />
                    Add HBL
                  </button>
                </div>

                <div className="space-y-2">
                  {hblSlots.map((slot, idx) => (
                    <div key={slot.id} className="flex items-start gap-2">
                      <div className="flex-1">
                        <UploadZone
                          label={`House B/L${hblSlots.length > 1 ? ` ${idx + 1}` : ""}`}
                          icon="🚢"
                          description="PDF or image"
                          file={slot.file}
                          onFileChange={(f) => setHblFile(slot.id, f)}
                          onRemove={() => removeHblFile(slot.id)}
                          accept={{ "application/pdf": [".pdf"], "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/webp": [".webp"] }}
                        />
                      </div>
                      {hblSlots.length > 1 && (
                        <button
                          onClick={() => removeHblSlot(slot.id)}
                          className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:border-critical hover:text-critical"
                          title="Remove this HBL slot"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Divider ─────────────────────────────────────────────── */}
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] font-mono text-text-faint uppercase tracking-widest">
                  Compare against
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* ── MBL + XML section ────────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-text-muted">Master B/L</p>
                  <UploadZone
                    label="Master B/L"
                    icon="⚓"
                    description="Carrier's master B/L"
                    file={mblFile}
                    onFileChange={(f) => { setMblFile(f); setResult(null); setError(null); }}
                    onRemove={() => { setMblFile(null); setResult(null); }}
                    accept={{ "application/pdf": [".pdf"], "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/webp": [".webp"] }}
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-text-muted">Gensoft XML</p>
                  <UploadZone
                    label="Gensoft XML"
                    icon="📄"
                    description="Awbolds export from Gensoft"
                    file={xmlFile}
                    onFileChange={(f) => { setXmlFile(f); setResult(null); setError(null); }}
                    onRemove={() => { setXmlFile(null); setResult(null); }}
                    accept={{ "text/xml": [".xml"], "application/xml": [".xml"] }}
                  />
                </div>
              </div>

              {/* ── Action buttons ───────────────────────────────────────── */}
              <div className="space-y-2">
                {/* Compare */}
                <button
                  onClick={handleCompare}
                  disabled={!canCompare || loading || generatingXml}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold transition-all ${
                    canCompare && !loading && !generatingXml
                      ? "bg-gradient-to-r from-accent to-emerald-600 text-white shadow-[0_4px_24px_var(--color-accent)/20] hover:shadow-[0_4px_32px_var(--color-accent)/30] cursor-pointer"
                      : "bg-surface-2 text-text-faint cursor-not-allowed"
                  }`}
                >
                  {loading ? (
                    <><Loader2 size={16} className="animate-spin" />{progress}</>
                  ) : (
                    <>
                      <Ship size={16} />
                      Compare Documents
                      {!canCompare && (
                        <span className="ml-1 text-[11px] font-normal opacity-60">
                          — upload HBL + MBL, XML, or 2+ HBLs
                        </span>
                      )}
                    </>
                  )}
                </button>

                {/* Generate XML */}
                <button
                  onClick={handleGenerateXml}
                  disabled={!canGenerateXml || loading || generatingXml}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all border ${
                    canGenerateXml && !loading && !generatingXml
                      ? "border-accent/40 bg-surface-1 text-accent hover:bg-accent/10 cursor-pointer"
                      : "border-border bg-surface-2 text-text-faint cursor-not-allowed"
                  }`}
                >
                  {generatingXml ? (
                    <><Loader2 size={15} className="animate-spin" />Generating XML...</>
                  ) : (
                    <>
                      <FileCode2 size={15} />
                      Generate Gensoft XML
                      {!canGenerateXml && (
                        <span className="ml-1 text-[11px] font-normal opacity-60">
                          — upload at least one HBL
                        </span>
                      )}
                    </>
                  )}
                </button>
              </div>

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
            <motion.div key="results" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <ResultsPanel result={result} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
