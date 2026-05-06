import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import PWAServiceWorkerRegistration from "@/components/pwa/PWAServiceWorkerRegistration";
import PWAInstallBanner from "@/components/pwa/PWAInstallBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Hausdame — Plataforma de operaciones para alquileres cortos",
  description: "Hausdame centraliza la gestión operativa de tus propiedades: limpieza, inventario, incidencias, equipos y accesos inteligentes.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Hausdame",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
        <PWAServiceWorkerRegistration />
        <PWAInstallBanner />
      </body>
    </html>
  );
}
