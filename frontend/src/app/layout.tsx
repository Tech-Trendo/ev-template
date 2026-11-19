import type { Metadata } from "next";
import "@/index.css";

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: {
    default: "Vehicle Template — Admin Console",
    template: "%s | Vehicle Template",
  },
  description: "Administrative dashboard template for vehicle and fleet management.",
  robots: { index: false, follow: false },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light">
      <body className="min-h-screen bg-[var(--bg-page)] font-sans text-[var(--text-primary)] antialiased">
        {children}
      </body>
    </html>
  );
}
