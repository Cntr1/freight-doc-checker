"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { FileUp, X } from "lucide-react";

interface UploadZoneProps {
  label: string;
  icon: string;
  description: string;
  file: File | null;
  onFileChange: (file: File) => void;
  onRemove: () => void;
  accept?: Record<string, string[]>;
}

export function UploadZone({
  label, icon, description, file, onFileChange, onRemove, accept,
}: UploadZoneProps) {
  const defaultAccept = {
    "application/pdf": [".pdf"],
    "image/png":       [".png"],
    "image/jpeg":      [".jpg", ".jpeg"],
    "image/webp":      [".webp"],
  };

  const onDrop = useCallback(
    (accepted: File[]) => { if (accepted[0]) onFileChange(accepted[0]); },
    [onFileChange]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: accept ?? defaultAccept,
    maxFiles: 1,
    multiple: false,
  });

  if (file) {
    return (
      <div className="group relative rounded-xl border border-accent-muted bg-surface-1 p-4 transition-all hover:border-accent/40">
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-2 text-text-muted opacity-0 transition-all hover:border-critical hover:text-critical group-hover:opacity-100"
        >
          <X size={12} />
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-lg">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] font-semibold tracking-wide text-accent">{label}</p>
            <p className="truncate text-sm text-text-secondary">{file.name}</p>
            <p className="font-mono text-[10px] text-text-faint">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={`cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition-all ${
        isDragActive ? "border-accent bg-accent-muted/20" : "border-border hover:border-border-subtle"
      }`}
    >
      <input {...getInputProps()} />
      <div className="mb-1.5 text-2xl">{icon}</div>
      <p className="text-sm font-semibold text-text-secondary">{label}</p>
      <p className="mt-0.5 font-mono text-[10px] text-text-faint">{description}</p>
      <div className="mt-2.5 flex items-center justify-center gap-1.5 text-text-muted">
        <FileUp size={13} />
        <span className="text-[11px]">
          {accept && Object.values(accept).flat().join(", ")}
        </span>
      </div>
    </div>
  );
}
