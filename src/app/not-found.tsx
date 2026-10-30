import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <div className="text-6xl font-bold tracking-tight">404</div>
        <p className="muted mt-2">Página não encontrada.</p>
        <Link href="/" className="btn btn-dark mt-6">Voltar</Link>
      </div>
    </main>
  );
}
