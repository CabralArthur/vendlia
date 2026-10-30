"use client";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel p-8 text-center">
      <div className="text-lg font-semibold">Algo deu errado</div>
      <p className="muted mt-1 text-sm">{error.digest ? `Código: ${error.digest}` : error.message}</p>
      <button onClick={reset} className="btn btn-dark mt-4">Tentar de novo</button>
    </div>
  );
}
