import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
import { FeedbackWidget } from "@/components/FeedbackWidget";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "meet.sfucourses.com",
  description: "Find when your SFU friend group is free on campus at the same time.",
};

/**
 * `viewportFit: "cover"` so `env(safe-area-inset-*)` is non-zero on notched
 * devices and any browser chrome that overlays the layout viewport. The nav
 * and feedback button already pad with those insets; without cover they stay 0
 * and the top of the bar can sit under the overlay.
 */
export const viewport: Viewport = {
  viewportFit: "cover",
};

/**
 * Shell for every page: nav, the route, footer, and the floating feedback
 * control. The column is `min-h-dvh` with the route in a `flex-1` wrapper so
 * the footer sits at the bottom on short pages without `mt-auto` (which, with
 * the old `html.h-full` / `body.min-h-full` chain, let the nav flex-shrink and
 * appear clipped under top browser chrome).
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="flex min-h-dvh flex-col">
        <Providers>
          <NavBar />
          <div className="flex flex-1 flex-col">{children}</div>
          <Footer />
          {/* Last, and fixed to the corner: it floats over every page, so it
              belongs outside the flow the footer ends. */}
          <FeedbackWidget />
        </Providers>
      </body>
    </html>
  );
}
