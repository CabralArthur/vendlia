"use client";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { replyAction } from "@/app/(app)/_actions/inbox";
import { SendHorizontal } from "lucide-react";

function SendBtn() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary h-11 w-11 !p-0" disabled={pending} aria-label="Enviar">
      <SendHorizontal size={18} />
    </button>
  );
}

export function Composer({ conversationId, suggestion, disabled }: { conversationId: string; suggestion?: string | null; disabled?: string }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    setText("");
  }, [conversationId]);
  if (disabled) return <div className="muted border-t border-[var(--line)] p-4 text-center text-sm">{disabled}</div>;
  return (
    <div className="border-t border-[var(--line)] p-3">
      {suggestion && (
        <button type="button" onClick={() => setText(suggestion)} className="mb-2 block w-full rounded-lg border border-dashed border-[var(--accent)] px-3 py-2 text-left text-xs">
          <span className="font-semibold text-emerald-600">Sugestão da IA:</span> {suggestion}
        </button>
      )}
      <form
        ref={ref}
        action={async (fd) => {
          await replyAction(fd);
        }}
        onSubmit={() => setTimeout(() => setText(""), 0)}
        className="flex items-end gap-2"
      >
        <input type="hidden" name="conversationId" value={conversationId} />
        <textarea
          name="body"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim()) ref.current?.requestSubmit();
            }
          }}
          rows={2}
          placeholder="Escreva sua resposta… (Enter envia, Shift+Enter quebra linha)"
          className="field min-h-11 flex-1 resize-none"
          required
        />
        <SendBtn />
      </form>
    </div>
  );
}

export function ScrollBottom({ dep }: { dep: string | number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Chromium may return a Promise from scrollIntoView; never return it from the effect.
    void ref.current?.scrollIntoView({ block: "end" });
  }, [dep]);
  return <div ref={ref} />;
}
