"use client";

/** Header checkbox that toggles every row checkbox named `ids` inside the same form. */
export function SelectAll({ label = "Selecionar todos" }: { label?: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      onChange={(e) => {
        const form = e.currentTarget.form;
        form?.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((c) => (c.checked = e.currentTarget.checked));
      }}
    />
  );
}
