'use client';

import React, { useState } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
  showMonthSelector?: boolean;
}

export default function AppLayout({ children, title, showMonthSelector = true }: AppLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
      {/* Sidebar on left */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="lg:pl-60 pl-0 print:pl-0 flex flex-col min-h-screen transition-all duration-300">
        {/* TopBar on top */}
        <div className="print:hidden">
          <TopBar 
            title={title} 
            showMonthSelector={showMonthSelector} 
            onMenuClick={() => setIsSidebarOpen(true)} 
          />
        </div>

        {/* Content Body */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
