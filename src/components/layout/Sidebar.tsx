'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { isSupabaseConfigured, createClient } from '@/lib/supabase/client';
import { 
  LayoutDashboard, 
  Receipt, 
  BarChart3, 
  LogOut, 
  Building2, 
  CreditCard 
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  className?: string;
}

export default function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase.auth.signOut();
    } else {
      // Clear mock session cookie
      document.cookie = 'mock-auth-session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    }
    router.push('/login');
    router.refresh();
  };

  const navItems = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard
    },
    {
      label: 'Payables',
      href: '/payables',
      icon: CreditCard
    },
    {
      label: 'PDC Tracker',
      href: '/pdcs',
      icon: Receipt
    },
    {
      label: 'Reports',
      href: '/reports',
      icon: BarChart3
    }
  ];

  return (
    <aside className={cn(
      "fixed inset-y-0 left-0 z-20 flex w-60 flex-col border-r border-slate-200 bg-white text-slate-900 print:hidden",
      className
    )}>
      {/* Brand Header */}
      <div className="flex h-16 items-center px-6 border-b border-slate-100 gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 shadow-md shadow-indigo-500/20">
          <Building2 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="font-bold tracking-tight text-slate-900 leading-none">Bright Flowers</h2>
          <span className="text-[10px] text-indigo-600 font-semibold uppercase tracking-wider">Trading LLC</span>
        </div>
      </div>

      {/* Main Nav Link Sections */}
      <nav className="flex-1 space-y-1.5 px-4 py-6">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive 
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10" 
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <item.icon className={cn(
                "h-5 w-5 shrink-0 transition-transform group-hover:scale-105",
                isActive ? "text-white" : "text-slate-400 group-hover:text-slate-900"
              )} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer / User Profile Signout */}
      <div className="border-t border-slate-100 p-4 bg-slate-50/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-800">
              KM
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-slate-800 truncate">Kumaresan</p>
              <p className="text-[10px] text-slate-500 truncate">kumaresan@brightflowers.com</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            title="Log Out"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 transition-colors"
          >
            <LogOut className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
