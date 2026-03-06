"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { FileUp, X, FileText } from "lucide-react";
import type { DocumentSlot } from "@/lib/types";

interface UploadZoneProps {
  docType: DocumentSlot;
  file: File | null;
  onFileChange: (file: File) => void;
  onRemove: () => void;
}

export function UploadZone({ docType, file, onFileChange, onRemove }: UploadZoneProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) onFileChange(accepted[0]);
    },
    [onFileChange]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/webp": [".webp"],
    },
    maxFiles: 1,
    multiple: false,
  });

  if (file) {
    return (
      <div className="group relative rounded-xl border border-accent-muted bg-surface-1 p-4 transition-all hover:border-accent/40">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-2 text-text-muted opacity-0 transition-all hover:border-critical hover:text-critical group-hover:opacity-100"
        >
          <X size={12} />
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-lg">
            {docType.icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] font-semibold tracking-wide text-accent">
              {docType.label}
            </p>
            <p className="truncate text-sm text-text-secondary">{file.name}</p>
            <p className="font-mono text-[10px] text-text-faint">
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all ${
        isDragActive
          ? "border-accent bg-accent-muted/20"
          : "border-border hover:border-border-subtle"
      }`}
    >
      <input {...getInputProps()} />
      <div className="mb-2 text-2xl">{docType.icon}</div>
      <p className="text-sm font-semibold text-text-secondary">{docType.label}</p>
      <p className="mt-1 font-mono text-[10px] text-text-faint">{docType.description}</p>
      <div className="mt-3 flex items-center justify-center gap-1.5 text-text-muted">
        <FileUp size={13} />
        <span className="text-[11px]">PDF or image</span>
      </div>
    </div>
  );
}
