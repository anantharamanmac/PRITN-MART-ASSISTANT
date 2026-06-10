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
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: '#0d1220',
              color: '#EDF2F7',
              border: '1px solid rgba(201, 162, 39, 0.2)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
              borderRadius: '12px',
              fontFamily: "'Inter', sans-serif",
              fontSize: '0.875rem',
            },
            success: {
              iconTheme: { primary: '#34C77A', secondary: '#0d1220' },
            },
            error: {
              iconTheme: { primary: '#E05252', secondary: '#0d1220' },
            },
          }}
        />
        {children}
      </body>
    </html>
  );
}
