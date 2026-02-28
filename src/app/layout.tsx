import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-slate-950 text-slate-100 antialiased selection:bg-blue-500/30`}>
        <div className="flex h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_var(--tw-gradient-stops))] from-blue-900/10 via-slate-950 to-slate-950">
          <Sidebar />
          <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
            <div className="h-full">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
