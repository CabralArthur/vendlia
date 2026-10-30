import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Vendlia", template: "%s · Vendlia" },
  description: "Sua próxima venda começa antes do primeiro contato.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#102F29" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
