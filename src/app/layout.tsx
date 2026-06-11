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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme') || 'dark';
                  document.documentElement.setAttribute('data-theme', theme);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--glass-shadow)',
              borderRadius: '12px',
              fontFamily: "'Inter', sans-serif",
              fontSize: '0.875rem',
            },
            success: {
              iconTheme: { primary: 'var(--success)', secondary: 'var(--bg-surface)' },
            },
            error: {
              iconTheme: { primary: 'var(--danger)', secondary: 'var(--bg-surface)' },
            },
          }}
        />
        {children}
      </body>
    </html>
  );
}
