"use client";

import { motion } from "framer-motion";
import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from "lucide-react";
import type { ComparisonResult, Severity } from "@/lib/types";

const severityConfig: Record<
  Severity,
  { bg: string; border: string; text: string; label: string; Icon: typeof AlertTriangle }
> = {
  critical: {
    bg: "bg-critical-muted",
    border: "border-critical-border",
    text: "text-critical-text",
    label: "CRITICAL",
    Icon: AlertTriangle,
  },
  warning: {
    bg: "bg-warning-muted",
    border: "border-warning-border",
    text: "text-warning-text",
    label: "WARNING",
    Icon: AlertCircle,
  },
  info: {
    bg: "bg-info-muted",
    border: "border-info-border",
    text: "text-info-text",
    label: "INFO",
    Icon: Info,
  },
};

function SeverityBadge({ severity }: { severity: Severity }) {
  const config = severityConfig[severity] || severityConfig.info;
  const { Icon } = config;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider ${config.bg} ${config.text} border ${config.border}`}
    >
      <Icon size={10} />
      {config.label}
    </span>
  );
}

export function ResultsPanel({ result }: { result: ComparisonResult }) {
  const criticalCount = result.discrepancies?.filter((d) => d.severity === "critical").length || 0;
  const warningCount = result.discrepancies?.filter((d) => d.severity === "warning").length || 0;
  const infoCount = result.discrepancies?.filter((d) => d.severity === "info").length || 0;
  const totalIssues = result.discrepancies?.length || 0;

  const overallColor =
    criticalCount > 0
      ? "text-critical"
      : warningCount > 0
        ? "text-warning"
        : totalIssues === 0
          ? "text-accent"
          : "text-info";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      {/* Summary */}
      <div className="rounded-xl border border-border bg-surface-1 p-5">
        <div className="mb-3 flex items-center gap-3">
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              criticalCount > 0
                ? "bg-critical shadow-[0_0_12px_var(--color-critical)]"
                : warningCount > 0
                  ? "bg-warning shadow-[0_0_12px_var(--color-warning)]"
                  : "bg-accent shadow-[0_0_12px_var(--color-accent)]"
            }`}
          />
          <h2 className={`text-lg font-bold ${overallColor}`}>
            {totalIssues === 0
              ? "All Clear"
              : `${totalIssues} Issue${totalIssues > 1 ? "s" : ""} Found`}
          </h2>
        </div>

        <p className="text-sm leading-relaxed text-text-secondary">{result.summary}</p>

        {totalIssues > 0 && (
          <div className="mt-3 flex gap-4 font-mono text-[11px]">
            {criticalCount > 0 && (
              <span className="text-critical-text">{criticalCount} critical</span>
            )}
            {warningCount > 0 && (
              <span className="text-warning-text">
                {warningCount} warning{warningCount > 1 ? "s" : ""}
              </span>
            )}
            {infoCount > 0 && <span className="text-info-text">{infoCount} info</span>}
          </div>
        )}
      </div>

      {/* Discrepancy Cards */}
      {result.discrepancies?.map((d, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.05 }}
          className="rounded-xl border border-border bg-surface-1 p-4"
        >
          <div className="mb-3 flex items-center gap-2.5">
            <SeverityBadge severity={d.severity} />
            <span className="text-sm font-semibold text-text-primary">{d.field}</span>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-lg bg-surface-2 p-3">
              <p className="mb-1 font-mono text-[9px] font-bold uppercase tracking-widest text-text-muted">
                {d.doc1_label}
              </p>
              <p className="break-words font-mono text-xs text-text-primary">
                {d.doc1_value || "—"}
              </p>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <p className="mb-1 font-mono text-[9px] font-bold uppercase tracking-widest text-text-muted">
                {d.doc2_label}
              </p>
              <p className="break-words font-mono text-xs text-text-primary">
                {d.doc2_value || "—"}
              </p>
            </div>
          </div>

          {d.note && (
            <p className="text-xs italic leading-relaxed text-text-muted">{d.note}</p>
          )}
        </motion.div>
      ))}

      {/* Matched Fields */}
      {result.matches?.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl border border-border bg-surface-1 p-4"
        >
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-accent" />
            <span className="font-mono text-[11px] font-bold tracking-wide text-accent">
              VERIFIED — NO ISSUES
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {result.matches.map((m, i) => (
              <span
                key={i}
                className="rounded-md border border-accent-muted bg-accent-muted/30 px-2.5 py-1 font-mono text-[10px] text-accent-hover"
              >
                {m}
              </span>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
