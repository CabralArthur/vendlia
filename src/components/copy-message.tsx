"use client";
import { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";

/** Copy the first-contact message or open it in the operator's own WhatsApp (no connected number needed). */
export function CopyMessage({ text, phone }: { text: string; phone: string | null }) {
  const [done, setDone] = useState(false);
  return (
    <div className="mt-4 rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] p-4">
      <div className="text-sm font-medium">Mandar do seu celular</div>
      <p className="muted mt-0.5 text-[0.8125rem]">Sem conectar número: copie a mensagem ou abra a conversa no seu WhatsApp. Depois, marque como enviado.</p>
      <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-[var(--surface-2)] p-3 text-[0.8125rem] whitespace-pre-wrap">{text}</pre>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={async () => {
            await navigator.clipboard.writeText(text).catch(() => {});
            setDone(true);
            setTimeout(() => setDone(false), 2000);
          }}
        >
          {done ? <Check size={14} /> : <Copy size={14} />} {done ? "Copiada" : "Copiar mensagem"}
        </button>
        {phone && (
          <a className="btn btn-secondary btn-sm" href={`https://wa.me/${phone}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Abrir no WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
