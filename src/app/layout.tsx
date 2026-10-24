import type { Metadata } from 'next';
import './globals.css';
import { CompanyProvider } from '@/context/CompanyContext';

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
      className="h-full antialiased font-sans"
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
