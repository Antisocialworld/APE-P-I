import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "APE-P-I",
  description: "Food delivery REST API",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
