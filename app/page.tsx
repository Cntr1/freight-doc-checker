"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, RotateCcw, Ship, Anchor, Plus, Trash2, FileCode2,
  PackageCheck, FileSearch,
} from "lucide-react";
import { UploadZone } from "@/components/upload-zone";
import { ResultsPanel } from "@/components/results-panel";
import type { ComparisonResult, HblSlot, ComparisonMode } from "@/lib/types";

let hblCounter = 0;
function newHblSlot(): HblSlot {
  return { id: `hbl_${++hblCounter}`, file: null };
}

export default function Home() {
  const [mode, setMode] = useState<ComparisonMode>("preshipment");

  // ── Pre-shipment state ───────────────────────────────────────────────────
  const [packingList, setPackingList] = useState<File | null>(null);
  const [invoice, setInvoice] = useState<File | null>(null);

  // ── B/L Verification state ───────────────────────────────────────────────
  const [hblSlots, setHblSlots] = useState<HblSlot[]>([newHblSlot()]);
  const [mblFile, setMblFile] = useState<File | null>(null);
  const [xmlFile, setXmlFile] = useState<File | null>(null);

  // ── Shared state ─────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatingXml, setGeneratingXml] = useState(false);

  // ── Derived ──────────────────────────────────────────────────────────────
  const canComparePreShipment = packingList !== null && invoice !== null;
  const hblCount = hblSlots.filter((s) => s.file !== null).length;
  const canCompareBl = hblCount >= 1 && (mblFile !== null || xmlFile !== null || hblCount >= 2);
  const canGenerateXml = hblCount >= 1;
  const hasAnyFile =
    packingList || invoice ||
    hblSlots.some((s) => s.file) || mblFile || xmlFile;

  const clearResult = () => { setResult(null); setError(null); };

  // ── HBL slot management ──────────────────────────────────────────────────
  const setHblFile = (id: string, file: File) => {
    setHblSlots((prev) => prev.map((s) => (s.id === id ? { ...s, file } : s)));
    clearResult();
  };
  const removeHblFile = (id: string) => {
    setHblSlots((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, file: null } : s));
      return next.filter((s, i) => s.file !== null || i === 0);
    });
    setResult(null);
  };
  const addHblSlot = () => setHblSlots((prev) => [...prev, newHblSlot()]);
  const removeHblSlot = (id: string) => {
    setHblSlots((prev) => {
      const next = prev.filter((s) => s.id !== id);
      return next.length > 0 ? next : [newHblSlot()];
    });
    setResult(null);
  };

  // ── Pre-shipment compare ─────────────────────────────────────────────────
  const handlePreShipmentCompare = async () => {
    if (!canComparePreShipment) return;
    setLoading(true); setError(null); setResult(null);
    setProgress("Reading documents...");
    try {
      const formData = new FormData();
      formData.append("action", "preshipment");
      formData.append("hbl_0", packingList!);
      formData.append("hbl_0_label", "Packing List");
      formData.append("hbl_1", invoice!);
      formData.append("hbl_1_label", "Commercial Invoice");
      setProgress("AI is reading your documents...");
      const res = await fetch("/api/compare", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false); setProgress("");
    }
  };

  // ── B/L compare ──────────────────────────────────────────────────────────
  const handleBlCompare = async () => {
    if (!canCompareBl) return;
    setLoading(true); setError(null); setResult(null);
    setProgress("Uploading documents...");
    try {
      const formData = new FormData();
      formData.append("action", "compare");
      hblSlots.forEach((slot, idx) => {
        if (slot.file) {
          formData.append(`hbl_${idx}`, slot.file);
          formData.append(
            `hbl_${idx}_label`,
            `House B/L${hblSlots.filter(s => s.file).length > 1 ? ` ${idx + 1}` : ""}`.trim()
          );
        }
      });
      if (mblFile) { formData.append("mbl", mblFile); formData.append("mbl_label", "Master B/L"); }
      if (xmlFile) { formData.append("xml_file", xmlFile); }
      setProgress("AI is reading your documents...");
      const res = await fetch("/api/compare", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
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
      if (mblFile) { formData.append("mbl", mblFile); formData.append("mbl_label", "Master B/L"); }
      const res = await fetch("/api/compare", { method: "POST", body: formData });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || `Server error ${res.status}`); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "Awbolds_export.xml"; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "XML generation failed.");
    } finally {
      setGeneratingXml(false);
    }
  };

  // ── Reset ────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setPackingList(null); setInvoice(null);
    setHblSlots([newHblSlot()]); setMblFile(null); setXmlFile(null);
    setResult(null); setError(null); setProgress("");
  };

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
              <p className="font-mono text-[10px] text-text-faint">AI-powered shipping document verification</p>
            </div>
          </div>
          <AnimatePresence>
            {(result || hasAnyFile) && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
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
            <motion.div key="upload" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-5">

              {/* ── Tabs ──────────────────────────────────────────────── */}
              <div className="flex gap-1 rounded-xl border border-border bg-surface-1 p-1">
                <button
                  onClick={() => { setMode("preshipment"); clearResult(); }}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                    mode === "preshipment"
                      ? "bg-surface-0 text-text-primary shadow-sm"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  <PackageCheck size={15} />
                  Pre-Shipment Check
                </button>
                <button
                  onClick={() => { setMode("bl"); clearResult(); }}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                    mode === "bl"
                      ? "bg-surface-0 text-text-primary shadow-sm"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  <Ship size={15} />
                  B/L Verification
                </button>
              </div>

              {/* ── Pre-Shipment tab ────────────────────────────────── */}
              {mode === "preshipment" && (
                <motion.div key="preshipment" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold text-text-secondary">Compare Packing List vs Invoice</h2>
                    <p className="mt-1 text-xs text-text-faint">
                      Cross-check quantities, descriptions, HS codes and weights before issuing the B/L.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-text-muted">Packing List</p>
                      <UploadZone
                        label="Packing List" icon="📦" description="PDF or image"
                        file={packingList}
                        onFileChange={(f) => { setPackingList(f); clearResult(); }}
                        onRemove={() => { setPackingList(null); clearResult(); }}
                      />
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-text-muted">Commercial Invoice</p>
                      <UploadZone
                        label="Commercial Invoice" icon="🧾" description="PDF or image"
                        file={invoice}
                        onFileChange={(f) => { setInvoice(f); clearResult(); }}
                        onRemove={() => { setInvoice(null); clearResult(); }}
                      />
                    </div>
                  </div>

                  <button
                    onClick={handlePreShipmentCompare}
                    disabled={!canComparePreShipment || loading}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold transition-all ${
                      canComparePreShipment && !loading
                        ? "bg-gradient-to-r from-accent to-emerald-600 text-white shadow-[0_4px_24px_var(--color-accent)/20] hover:shadow-[0_4px_32px_var(--color-accent)/30] cursor-pointer"
                        : "bg-surface-2 text-text-faint cursor-not-allowed"
                    }`}
                  >
                    {loading ? (
                      <><Loader2 size={16} className="animate-spin" />{progress}</>
                    ) : (
                      <>
                        <FileSearch size={16} />
                        Run Pre-Shipment Check
                        {!canComparePreShipment && (
                          <span className="ml-1 text-[11px] font-normal opacity-60">— upload both documents</span>
                        )}
                      </>
                    )}
                  </button>
                </motion.div>
              )}

              {/* ── B/L Verification tab ────────────────────────────── */}
              {mode === "bl" && (
                <motion.div key="bl" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

                  {/* HBLs */}
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
                              icon="🚢" description="PDF or image"
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
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[10px] font-mono text-text-faint uppercase tracking-widest">Compare against</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  {/* MBL + XML */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-text-muted">Master B/L</p>
                      <UploadZone
                        label="Master B/L" icon="⚓" description="Carrier's master B/L"
                        file={mblFile}
                        onFileChange={(f) => { setMblFile(f); clearResult(); }}
                        onRemove={() => { setMblFile(null); clearResult(); }}
                        accept={{ "application/pdf": [".pdf"], "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/webp": [".webp"] }}
                      />
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-text-muted">Gensoft XML</p>
                      <UploadZone
                        label="Gensoft XML" icon="📄" description="Awbolds export from Gensoft"
                        file={xmlFile}
                        onFileChange={(f) => { setXmlFile(f); clearResult(); }}
                        onRemove={() => { setXmlFile(null); clearResult(); }}
                        accept={{ "text/xml": [".xml"], "application/xml": [".xml"] }}
                      />
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="space-y-2">
                    <button
                      onClick={handleBlCompare}
                      disabled={!canCompareBl || loading || generatingXml}
                      className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold transition-all ${
                        canCompareBl && !loading && !generatingXml
                          ? "bg-gradient-to-r from-accent to-emerald-600 text-white shadow-[0_4px_24px_var(--color-accent)/20] hover:shadow-[0_4px_32px_var(--color-accent)/30] cursor-pointer"
                          : "bg-surface-2 text-text-faint cursor-not-allowed"
                      }`}
                    >
                      {loading ? (
                        <><Loader2 size={16} className="animate-spin" />{progress}</>
                      ) : (
                        <>
                          <Ship size={16} />
                          Verify B/L Documents
                          {!canCompareBl && (
                            <span className="ml-1 text-[11px] font-normal opacity-60">— upload HBL + MBL, XML, or 2+ HBLs</span>
                          )}
                        </>
                      )}
                    </button>

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
                            <span className="ml-1 text-[11px] font-normal opacity-60">— upload at least one HBL</span>
                          )}
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
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
