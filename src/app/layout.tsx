import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Print Mart Assistant",
  description: "Attendance and Work Tracker",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-icon.png",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: '#1e1e2d',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)',
            }
          }}
        />
        {children}
      </body>
    </html>
  );
}
