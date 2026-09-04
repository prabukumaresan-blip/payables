'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Company, CompanyBankAccount, SEEDED_COMPANIES } from '@/lib/supabase/mockDb';
import { getCompanies } from '@/lib/supabase/queries';

interface CompanyContextType {
  companies: Company[];
  selectedCompanyId: string; // 'ALL' or specific company id
  selectedCompany: Company | null; // null if 'ALL'
  defaultBankAccount: CompanyBankAccount | null;
  loading: boolean;
  setSelectedCompanyId: (id: string) => void;
  reloadCompanies: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

const COMPANY_STORAGE_KEY = 'payables_active_company_id';

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>(SEEDED_COMPANIES);
  const [selectedCompanyId, setSelectedCompanyIdState] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);

  const fetchCompanies = async () => {
    try {
      const data = await getCompanies();
      setCompanies(data);
    } catch (e) {
      console.error('Failed to load companies:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(COMPANY_STORAGE_KEY);
      if (saved) {
        setSelectedCompanyIdState(saved);
      }
    }
  }, []);

  const setSelectedCompanyId = (id: string) => {
    setSelectedCompanyIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem(COMPANY_STORAGE_KEY, id);
    }
  };

  const selectedCompany = companies.find(c => c.id === selectedCompanyId) || null;

  const defaultBankAccount = selectedCompany
    ? (selectedCompany.bank_accounts?.find(a => a.is_default) || selectedCompany.bank_accounts?.[0] || null)
    : null;

  return (
    <CompanyContext.Provider
      value={{
        companies,
        selectedCompanyId,
        selectedCompany,
        defaultBankAccount,
        loading,
        setSelectedCompanyId,
        reloadCompanies: fetchCompanies,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}
