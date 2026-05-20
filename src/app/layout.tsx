import type { Metadata, Viewport } from "next";
import ClientLayout from "./ClientLayout";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://intervalo.rodrigobustamante.cl"),
  title: {
    default: "Intervalo",
    template: "%s — Intervalo",
  },
  description:
    "El metro como instrumento. Visualización sonora en tiempo real del Metro de Santiago y Madrid.",
  keywords: ["metro", "Santiago", "Madrid", "música", "visualización", "GTFS", "transporte"],
  authors: [{ name: "Rodrigo Bustamante" }],
  robots: { index: true, follow: true },
  openGraph: {
    title: "Intervalo",
    description: "El metro como instrumento.",
    url: "https://intervalo.rodrigobustamante.cl",
    siteName: "Intervalo",
    locale: "es_CL",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Intervalo",
    description: "El metro como instrumento.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#f5f0e8" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://basemaps.cartocdn.com" />
        <link rel="dns-prefetch" href="https://basemaps.cartocdn.com" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
