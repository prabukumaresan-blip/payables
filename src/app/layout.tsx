import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { CompanyProvider } from '@/context/CompanyContext';

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Monthly Payables Tracker | Enterprise Finance Console',
  description: 'Enterprise corporate payables tracking and financial disbursement management platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/10 selection:text-indigo-600">
        <CompanyProvider>
          {children}
        </CompanyProvider>
      </body>
    </html>
  );
}
