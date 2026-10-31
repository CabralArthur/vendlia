"use client";
import { useState } from "react";
import { Upload } from "lucide-react";

/** Styled file input with Portuguese labels (the native control follows the browser's language). */
export function FilePicker({ name, accept, required }: { name: string; accept?: string; required?: boolean }) {
  const [file, setFile] = useState<string | null>(null);
  return (
    <span className="flex h-[var(--control-h)] w-full items-center overflow-hidden rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--surface)] text-sm focus-within:border-[var(--color-mint-600)] focus-within:shadow-[var(--focus)]">
      <span className="relative flex h-full shrink-0 cursor-pointer items-center gap-1.5 border-r border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 font-semibold">
        <Upload size={15} aria-hidden /> Escolher arquivo
        <input
          type="file"
          name={name}
          accept={accept}
          required={required}
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => setFile(e.currentTarget.files?.[0]?.name ?? null)}
        />
      </span>
      <span className={`truncate px-3 ${file ? "" : "subtle"}`}>{file ?? "Nenhum arquivo escolhido"}</span>
    </span>
  );
}
