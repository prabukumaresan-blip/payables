import { format, addDays, subDays } from 'date-fns';

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
  created_at?: string;
}

export const SEEDED_VENDORS: Vendor[] = [];

export interface Employee {
  id: string;
  name: string;
  department?: string | null;
  email?: string | null;
  created_at?: string;
}

export const SEEDED_EMPLOYEES: Employee[] = [];

export interface Payable {
  id: string;
  title: string;
  category_id: string;
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
  pdc?: PDC | null;
  loan?: LoanSchedule | null;
  category?: Category | null;
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
      categories: SEEDED_CATEGORIES,
      vendors: SEEDED_VENDORS,
      employees: SEEDED_EMPLOYEES,
      payables: [],
      pdcs: [],
      loan_schedule: []
    };
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

  return { categories, vendors, employees, payables, pdcs, loan_schedule };
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
