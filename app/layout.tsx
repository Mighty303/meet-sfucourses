import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { casEnabled } from "@/lib/cas";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Asked once, on the server, so a modal deep inside a client page
            can still know whether to offer the SFU door. */}
        <Providers sfu={casEnabled()}>
          <NavBar />
          {children}
          <Footer />
          {/* Last, and fixed to the corner: it floats over every page, so it
              belongs outside the flow the footer ends. */}
          <FeedbackWidget />
        </Providers>
        {/* Umami: cookieless pageview tracking. data-domains pins it to the
            real host, so previews and localhost stay out of the numbers. */}
        <Script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id="9bdfa43c-21c4-4174-bb1b-105e2d56331e"
          data-domains="meet.sfucourses.com"
        />
      </body>
    </html>
  );
}
