import { format, addDays, subDays } from 'date-fns';

export interface CompanyBankAccount {
  id: string;
  company_id: string;
  bank_name: string;
  account_number: string;
  swift_code?: string | null;
  account_title?: string | null;
  currency: string;
  is_default: boolean;
}

export interface Company {
  id: string;
  name: string;
  short_name?: string | null;
  subtitle?: string | null;
  tax_number?: string | null;
  cr_number?: string | null;
  logo_url?: string | null;
  color?: string | null;
  is_active: boolean;
  bank_accounts: CompanyBankAccount[];
  created_at?: string;
}

export const SEEDED_COMPANIES: Company[] = [
  {
    id: 'comp-1',
    name: 'BRIGHT FLOWERS TRADING LLC',
    short_name: 'Bright Flowers',
    subtitle: 'Trading LLC',
    tax_number: 'OM1100234567',
    cr_number: '1249823',
    color: 'indigo',
    is_active: true,
    bank_accounts: [
      {
        id: 'acc-1',
        company_id: 'comp-1',
        bank_name: 'Bank Muscat',
        account_number: '0371024323360013',
        swift_code: 'BMUSOMRX',
        account_title: 'Main Operations Account',
        currency: 'OMR',
        is_default: true,
      },
      {
        id: 'acc-2',
        company_id: 'comp-1',
        bank_name: 'Bank Dhofar',
        account_number: '0492018471200021',
        swift_code: 'BKDHOMRX',
        account_title: 'Secondary Operations',
        currency: 'OMR',
        is_default: false,
      },
    ],
    created_at: new Date().toISOString(),
  },
  {
    id: 'comp-2',
    name: 'DESERT BLOOM LOGISTICS LLC',
    short_name: 'Desert Bloom',
    subtitle: 'Logistics LLC',
    tax_number: 'OM1100987654',
    cr_number: '1388412',
    color: 'emerald',
    is_active: true,
    bank_accounts: [
      {
        id: 'acc-3',
        company_id: 'comp-2',
        bank_name: 'National Bank of Oman',
        account_number: '0183049281720031',
        swift_code: 'NBOKOMRX',
        account_title: 'Corporate Treasury Account',
        currency: 'OMR',
        is_default: true,
      },
      {
        id: 'acc-4',
        company_id: 'comp-2',
        bank_name: 'Bank Muscat',
        account_number: '0315098234120044',
        swift_code: 'BMUSOMRX',
        account_title: 'Payroll & Fleet Account',
        currency: 'OMR',
        is_default: false,
      },
    ],
    created_at: new Date().toISOString(),
  },
  {
    id: 'comp-3',
    name: 'GULF PETALS ENTERPRISES SPC',
    short_name: 'Gulf Petals',
    subtitle: 'Enterprises SPC',
    tax_number: 'OM1100554433',
    cr_number: '1499201',
    color: 'violet',
    is_active: true,
    bank_accounts: [
      {
        id: 'acc-5',
        company_id: 'comp-3',
        bank_name: 'Sohar International',
        account_number: '0250017482910055',
        swift_code: 'BKSHOMRX',
        account_title: 'Main Commercial Account',
        currency: 'OMR',
        is_default: true,
      },
    ],
    created_at: new Date().toISOString(),
  },
];

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface Vendor {
  id: string;
  name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  bank_account?: string | null;
  bank_name?: string | null;
  account_no?: string | null;
  swift_code?: string | null;
  bank_type?: 'BANK_MUSCAT' | 'OTHER_BANK' | null;
  zoho_contact_id?: string | null;
  outstanding_payable_amount?: number | null;
  unused_credits_payable_amount?: number | null;
  zoho_last_synced_at?: string | null;
  company_id?: string | null;
  created_at?: string;
}

export const SEEDED_VENDORS: Vendor[] = [];

export interface Employee {
  id: string;
  name: string;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
  bank_account?: string | null;
  bank_name?: string | null;
  account_no?: string | null;
  swift_code?: string | null;
  bank_type?: 'BANK_MUSCAT' | 'OTHER_BANK' | null;
  company_id?: string | null;
  created_at?: string;
}

export const SEEDED_EMPLOYEES: Employee[] = [];

export interface Landowner {
  id: string;
  name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  bank_account?: string | null;
  bank_name?: string | null;
  account_no?: string | null;
  swift_code?: string | null;
  bank_type?: 'BANK_MUSCAT' | 'OTHER_BANK' | null;
  company_id?: string | null;
  created_at?: string;
}

export const SEEDED_LANDOWNERS: Landowner[] = [];

export interface Payable {
  id: string;
  title: string;
  category_id: string;
  company_id?: string | null;
  debit_bank_account_id?: string | null;
  vendor_name: string | null;
  amount: number;
  currency: string;
  due_date: string;
  payment_date: string | null;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled' | 'partial';
  paid_amount?: number | null;
  recurrence: 'once' | 'monthly' | 'quarterly' | 'annual';
  reference_no: string | null;
  bank_account: string | null;
  notes: string | null;
  attachment_url: string | null;
  month_year: string;
  created_at: string;
  updated_at: string;
  zoho_bill_id?: string | null;
  zoho_bill_number?: string | null;
  company?: Company | null;
  pdc?: PDC | null;
  loan?: LoanSchedule | null;
  category?: Category | null;
  payments?: PaymentHistory[] | null;
  rent_start_month?: string | null;
  rent_end_month?: string | null;
  rent_repeat_sequence?: 'monthly' | 'weekly' | 'quarterly' | null;
  rent_due_day?: number | null;
  pdc_start_date?: string | null;
  pdc_end_date?: string | null;
  pdc_no_of_cheques?: number | null;
}

export interface PDC {
  id: string;
  payable_id: string;
  cheque_no: string;
  bank_name: string | null;
  cheque_date: string;
  presented_date: string | null;
  status: 'pending' | 'presented' | 'cleared' | 'bounced';
  reminder_days?: number | null;
}

export interface LoanSchedule {
  id: string;
  payable_id: string;
  installment_no: number;
  principal: number;
  interest: number;
  balance_after: number;
}

export interface PaymentHistory {
  id: string;
  payable_id: string;
  amount: number;
  payment_date: string;
  reference_no?: string | null;
  bank_account?: string | null;
  notes?: string | null;
  zoho_payment_id?: string | null;
  zoho_synced_at?: string | null;
  company_id?: string | null;
  created_at?: string;
}

// Seeded categories
export const SEEDED_CATEGORIES: Category[] = [
  { id: 'cat-1', name: 'Vendor Payment', icon: 'Building2', color: 'blue' },
  { id: 'cat-2', name: 'Rent', icon: 'Home', color: 'violet' },
  { id: 'cat-3', name: 'Loan', icon: 'Landmark', color: 'amber' },
  { id: 'cat-4', name: 'PDC', icon: 'Receipt', color: 'orange' },
  { id: 'cat-5', name: 'Petty Cash', icon: 'Wallet', color: 'green' },
  { id: 'cat-6', name: 'Tax', icon: 'Scale', color: 'rose' },
  { id: 'cat-7', name: 'Other', icon: 'MoreHorizontal', color: 'slate' },
  { id: 'cat-8', name: 'Utility Payments', icon: 'Zap', color: 'cyan' }
];

const getStorageKey = (key: string) => `payables_tracker_v2_${key}`;

export const getMockDb = () => {
  if (typeof window === 'undefined') {
    return {
      companies: SEEDED_COMPANIES,
      categories: SEEDED_CATEGORIES,
      vendors: SEEDED_VENDORS,
      employees: SEEDED_EMPLOYEES,
      landowners: SEEDED_LANDOWNERS,
      payables: [],
      pdcs: [],
      loan_schedule: [],
      payment_history: []
    };
  }

  // Load companies
  let companies = SEEDED_COMPANIES;
  const storedCompanies = localStorage.getItem(getStorageKey('companies'));
  if (storedCompanies) {
    try {
      companies = JSON.parse(storedCompanies);
      // Auto merge any new seeded companies
      const storedIds = companies.map((c: any) => c.id);
      const missing = SEEDED_COMPANIES.filter(c => !storedIds.includes(c.id));
      if (missing.length > 0) {
        companies = [...companies, ...missing];
        localStorage.setItem(getStorageKey('companies'), JSON.stringify(companies));
      }
    } catch {
      companies = SEEDED_COMPANIES;
    }
  } else {
    localStorage.setItem(getStorageKey('companies'), JSON.stringify(SEEDED_COMPANIES));
  }

  // Load categories
  let categories = SEEDED_CATEGORIES;
  const storedCats = localStorage.getItem(getStorageKey('categories'));
  if (storedCats) {
    categories = JSON.parse(storedCats);
    // Auto-merge new categories not present in local storage
    const storedIds = categories.map((c: any) => c.id);
    const missingCats = SEEDED_CATEGORIES.filter(c => !storedIds.includes(c.id));
    if (missingCats.length > 0) {
      categories = [...categories, ...missingCats];
      localStorage.setItem(getStorageKey('categories'), JSON.stringify(categories));
    }
  } else {
    localStorage.setItem(getStorageKey('categories'), JSON.stringify(SEEDED_CATEGORIES));
  }

  // Load vendors
  let vendors = SEEDED_VENDORS;
  const storedVendors = localStorage.getItem(getStorageKey('vendors'));
  if (storedVendors) {
    vendors = JSON.parse(storedVendors);
  } else {
    localStorage.setItem(getStorageKey('vendors'), JSON.stringify(SEEDED_VENDORS));
  }

  // Load employees
  let employees = SEEDED_EMPLOYEES;
  const storedEmployees = localStorage.getItem(getStorageKey('employees'));
  if (storedEmployees) {
    employees = JSON.parse(storedEmployees);
  } else {
    localStorage.setItem(getStorageKey('employees'), JSON.stringify(SEEDED_EMPLOYEES));
  }

  // Load payables
  let payables: Payable[] = [];
  const storedPayables = localStorage.getItem(getStorageKey('payables'));
  if (storedPayables) {
    payables = JSON.parse(storedPayables);
    // Assign default company if none exists
    let modified = false;
    payables.forEach(p => {
      if (!p.company_id) {
        p.company_id = 'comp-1';
        modified = true;
      }
    });
    if (modified) {
      localStorage.setItem(getStorageKey('payables'), JSON.stringify(payables));
    }
  } else {
    payables = [];
    localStorage.setItem(getStorageKey('payables'), JSON.stringify(payables));
  }

  // Load PDCs and Loan schedules from payables
  const pdcs: PDC[] = [];
  const loan_schedule: LoanSchedule[] = [];
  payables.forEach(p => {
    if (p.pdc) pdcs.push(p.pdc);
    if (p.loan) loan_schedule.push(p.loan);
  });

  // Load payment history
  let payment_history: PaymentHistory[] = [];
  const storedHistory = localStorage.getItem(getStorageKey('payment_history'));
  if (storedHistory) {
    payment_history = JSON.parse(storedHistory);
  } else {
    payment_history = [];
    localStorage.setItem(getStorageKey('payment_history'), JSON.stringify(payment_history));
  }

  // Load landowners
  let landowners: Landowner[] = [];
  const storedLandowners = localStorage.getItem(getStorageKey('landowners'));
  if (storedLandowners) {
    landowners = JSON.parse(storedLandowners);
  } else {
    landowners = SEEDED_LANDOWNERS;
    localStorage.setItem(getStorageKey('landowners'), JSON.stringify(SEEDED_LANDOWNERS));
  }

  return { companies, categories, vendors, employees, landowners, payables, pdcs, loan_schedule, payment_history };
};

export const saveMockCompanies = (companies: Company[]) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(getStorageKey('companies'), JSON.stringify(companies));
  }
};

export const saveMockPayables = (payables: Payable[]) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(getStorageKey('payables'), JSON.stringify(payables));
  }
};

export const saveMockVendors = (vendors: any[]) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(getStorageKey('vendors'), JSON.stringify(vendors));
  }
};

export const saveMockEmployees = (employees: any[]) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(getStorageKey('employees'), JSON.stringify(employees));
  }
};

export const saveMockPaymentHistory = (history: PaymentHistory[]) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(getStorageKey('payment_history'), JSON.stringify(history));
  }
};

export const saveMockLandowners = (landowners: any[]) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(getStorageKey('landowners'), JSON.stringify(landowners));
  }
};
