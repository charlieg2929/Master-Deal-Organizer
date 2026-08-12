import "./globals.css";

export const metadata = {
  title: "Field Ledger",
  description: "Off-market prospecting tracker — Tier 1 Properties",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#16283A",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
