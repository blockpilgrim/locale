import type { Metadata } from "next";
import { Inter, Playfair_Display, Fraunces } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  style: "italic",
});

export const metadata: Metadata = {
  title: "Locale — Neighborhood Intelligence",
  description:
    "AI-powered neighborhood reports that tell you what it's actually like to live somewhere. Enter any US address and get a beautifully designed, data-driven portrait of the area.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${playfair.variable} ${fraunces.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
