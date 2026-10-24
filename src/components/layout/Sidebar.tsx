'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { isSupabaseConfigured, createClient } from '@/lib/supabase/client';
import { useCompany } from '@/context/CompanyContext';
import { 
  LayoutDashboard, 
  Receipt, 
  BarChart3, 
  LogOut, 
  Building2, 
  CreditCard,
  Users,
  Home,
  Briefcase,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  className?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ className, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { selectedCompany } = useCompany();

  const handleLogout = async () => {
    // Clear mock session cookie
    document.cookie = 'mock-auth-session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';

    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase.auth.signOut();
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
      label: 'Vendors',
      href: '/vendors',
      icon: Building2
    },
    {
      label: 'Employees',
      href: '/employees',
      icon: Users
    },
    {
      label: 'Landowners',
      href: '/landowners',
      icon: Home
    },
    {
      label: 'Companies',
      href: '/companies',
      icon: Briefcase
    },
    {
      label: 'Reports',
      href: '/reports',
      icon: BarChart3
    }
  ];

  const brandTitle = selectedCompany?.short_name || 'Bright Flowers';
  const brandSubtitle = selectedCompany?.subtitle || 'Trading LLC';

  return (
    <>
      {/* Backdrop overlay for mobile screen sizes */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-slate-200/90 bg-white text-slate-900 print:hidden transition-transform duration-300 ease-in-out lg:translate-x-0 shadow-[1px_0_4px_0_rgba(15,23,42,0.03)]",
        isOpen ? "translate-x-0" : "-translate-x-full",
        className
      )}>
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between px-5 border-b border-slate-150/90 bg-slate-50/40">
          <Link href="/companies" className="flex items-center gap-3 group transition-transform">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white border border-slate-200/80 p-1 shadow-2xs group-hover:scale-105 group-hover:border-slate-300 transition-all">
              <img
                src="/bright-flowers-logo.png"
                alt="Bright Flowers Logo"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="truncate">
              <h2 className="text-xs font-bold tracking-tight text-slate-900 leading-tight uppercase font-sans truncate">
                {brandTitle}
              </h2>
              <span className="text-[9.5px] text-slate-400 font-semibold tracking-wider uppercase block truncate">
                {brandSubtitle || 'Enterprise Financials'}
              </span>
            </div>
          </Link>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:hidden cursor-pointer"
              aria-label="Close sidebar"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          )}
        </div>

        {/* Section Label */}
        <div className="px-5 pt-5 pb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Financial Management
          </span>
        </div>

        {/* Main Nav Link Sections */}
        <nav className="flex-1 space-y-1 px-3 py-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (onClose) onClose();
                }}
                className={cn(
                  "group flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold tracking-wide transition-all duration-150",
                  isActive 
                    ? "bg-slate-900 text-white shadow-sm" 
                    : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-950"
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon className={cn(
                    "h-4 w-4 shrink-0 transition-transform group-hover:scale-105",
                    isActive ? "text-emerald-400" : "text-slate-400 group-hover:text-slate-700"
                  )} />
                  <span>{item.label}</span>
                </div>
                {isActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Corporate Status & User Signout */}
        <div className="border-t border-slate-150/90 p-4 bg-slate-50/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 truncate">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-[11px] font-bold text-white shadow-xs">
                KM
              </div>
              <div className="truncate">
                <p className="text-xs font-bold text-slate-900 truncate leading-tight">Kumaresan</p>
                <p className="text-[10px] font-medium text-slate-400 truncate">Finance Controller</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              title="Sign Out of Portal"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/80 hover:text-rose-600 transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
