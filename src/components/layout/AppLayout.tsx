'use client';

import React from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
  showMonthSelector?: boolean;
}

export default function AppLayout({ children, title, showMonthSelector = true }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
      {/* Sidebar on left */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="pl-60 print:pl-0 flex flex-col min-h-screen">
        {/* TopBar on top */}
        <div className="print:hidden">
          <TopBar title={title} showMonthSelector={showMonthSelector} />
        </div>

        {/* Content Body */}
        <main className="flex-1 p-6 md:p-8 max-w-[1400px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
