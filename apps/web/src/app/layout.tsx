import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AuthProvider } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import RouteGuard from "@/components/RouteGuard";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/Toast";

const outfit = Outfit({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Research Workbench",
  description: "Evidence-grounded multi-model deliberation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.className} text-black antialiased selection:bg-blue-200 selection:text-blue-900`}>
        <Providers>
          <AuthProvider>
          <ToastProvider>
          <ErrorBoundary>
          <div className="min-h-screen bg-gray-50 flex flex-col">
            <NavBar />
            <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
              <RouteGuard>{children}</RouteGuard>
            </main>
          </div>
          </ErrorBoundary>
          </ToastProvider>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
