import { isSupabaseConfigured, createClient as createBrowserSupabase } from './client';
import { 
  getMockDb, 
  saveMockCompanies,
  saveMockPayables, 
  saveMockVendors, 
  saveMockEmployees, 
  saveMockPaymentHistory, 
  saveMockLandowners, 
  SEEDED_CATEGORIES, 
  SEEDED_COMPANIES,
  Company,
  CompanyBankAccount,
  Payable, 
  PDC, 
  Category, 
  LoanSchedule, 
  Vendor, 
  Employee, 
  Landowner, 
  PaymentHistory 
} from './mockDb';
import { format, parse, addMonths, compareAsc, addWeeks, endOfMonth } from 'date-fns';

// Helper to determine if we should use mock database
const shouldUseMock = () => {
  return !isSupabaseConfigured();
};

export async function getCompanies(): Promise<Company[]> {
  if (!shouldUseMock()) {
    try {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.from('companies').select('*');
      if (!error && data && data.length > 0) {
        return data as Company[];
      }
    } catch {
      // Fallback to local storage
    }
  }
  return getMockDb().companies;
}

export async function getCompanyById(id: string): Promise<Company | null> {
  const list = await getCompanies();
  return list.find(c => c.id === id) || null;
}

export async function createCompany(companyData: Omit<Company, 'id' | 'created_at'>): Promise<Company> {
  const newId = typeof crypto !== 'undefined' ? crypto.randomUUID() : 'comp-' + Math.random().toString(36).substr(2, 9);
  const now = new Date().toISOString();
  const newCompany: Company = {
    ...companyData,
    id: newId,
    bank_accounts: (companyData.bank_accounts || []).map((b, idx) => ({
      ...b,
      id: b.id || (typeof crypto !== 'undefined' ? crypto.randomUUID() : `acc-${idx + 1}`),
      company_id: newId
    })),
    created_at: now
  };

  if (!shouldUseMock()) {
    try {
      const supabase = createBrowserSupabase();
      await supabase.from('companies').insert(newCompany);
    } catch (e) {
      console.warn('Supabase company insert error (fallback to local):', e);
    }
  }

  const db = getMockDb();
  const updated = [...db.companies, newCompany];
  saveMockCompanies(updated);
  return newCompany;
}

export async function updateCompany(id: string, companyData: Partial<Company>): Promise<Company> {
  const db = getMockDb();
  const index = db.companies.findIndex(c => c.id === id);
  const original = index !== -1 ? db.companies[index] : SEEDED_COMPANIES[0];

  const updated: Company = {
    ...original,
    ...companyData,
    bank_accounts: companyData.bank_accounts 
      ? companyData.bank_accounts.map((b, idx) => ({
          ...b,
          id: b.id || (typeof crypto !== 'undefined' ? crypto.randomUUID() : `acc-${idx + 1}`),
          company_id: id
        }))
      : original.bank_accounts
  };

  if (!shouldUseMock()) {
    try {
      const supabase = createBrowserSupabase();
      await supabase.from('companies').update(updated).eq('id', id);
    } catch (e) {
      console.warn('Supabase company update error:', e);
    }
  }

  if (index !== -1) {
    db.companies[index] = updated;
  } else {
    db.companies.push(updated);
  }
  saveMockCompanies(db.companies);
  return updated;
}

export async function deleteCompany(id: string): Promise<boolean> {
  if (!shouldUseMock()) {
    try {
      const supabase = createBrowserSupabase();
      await supabase.from('companies').delete().eq('id', id);
    } catch (e) {
      console.warn('Supabase company delete error:', e);
    }
  }

  const db = getMockDb();
  // Don't delete if it's the only company
  if (db.companies.length <= 1) {
    return false;
  }
  const countBefore = db.companies.length;
  const filtered = db.companies.filter(c => c.id !== id);
  saveMockCompanies(filtered);
  return filtered.length < countBefore;
}

export async function addCompanyBankAccount(companyId: string, bankAccount: Omit<CompanyBankAccount, 'id' | 'company_id'>): Promise<Company> {
  const company = await getCompanyById(companyId);
  if (!company) throw new Error('Company not found');

  const newAccId = typeof crypto !== 'undefined' ? crypto.randomUUID() : 'acc-' + Math.random().toString(36).substr(2, 9);
  let updatedAccounts = [...(company.bank_accounts || [])];

  if (bankAccount.is_default) {
    updatedAccounts = updatedAccounts.map(a => ({ ...a, is_default: false }));
  }

  updatedAccounts.push({
    ...bankAccount,
    id: newAccId,
    company_id: companyId,
    is_default: updatedAccounts.length === 0 ? true : bankAccount.is_default
  });

  return updateCompany(companyId, { bank_accounts: updatedAccounts });
}

export async function updateCompanyBankAccount(
  companyId: string, 
  accountId: string, 
  data: Partial<CompanyBankAccount>
): Promise<Company> {
  const company = await getCompanyById(companyId);
  if (!company) throw new Error('Company not found');

  let accounts = company.bank_accounts || [];
  if (data.is_default) {
    accounts = accounts.map(a => ({ ...a, is_default: false }));
  }

  const updatedAccounts = accounts.map(acc => {
    if (acc.id === accountId) {
      return { ...acc, ...data };
    }
    return acc;
  });

  return updateCompany(companyId, { bank_accounts: updatedAccounts });
}

export async function deleteCompanyBankAccount(companyId: string, accountId: string): Promise<Company> {
  const company = await getCompanyById(companyId);
  if (!company) throw new Error('Company not found');

  let remaining = (company.bank_accounts || []).filter(a => a.id !== accountId);
  // Ensure at least one default account if accounts exist
  if (remaining.length > 0 && !remaining.some(a => a.is_default)) {
    remaining[0].is_default = true;
  }

  return updateCompany(companyId, { bank_accounts: remaining });
}

export async function getCategories(): Promise<Category[]> {
  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase.from('categories').select('*');
    if (!error && data) {
      // Check if there are missing categories in the database compared to SEEDED_CATEGORIES
      const databaseIds = data.map((c: any) => c.id);
      const missingCats = SEEDED_CATEGORIES.filter(c => !databaseIds.includes(c.id));
      if (missingCats.length > 0) {
        const { error: seedError } = await supabase.from('categories').insert(missingCats);
        if (!seedError) {
          // Return combined list sorted or in original order
          const combined = [...data, ...missingCats];
          return combined;
        }
      }
      return data;
    }
  }
  return getMockDb().categories;
}

export async function getPayables(
  monthYear: string,
  filters: { categoryId?: string; status?: string; search?: string; companyId?: string } = {}
): Promise<Payable[]> {
  const companies = await getCompanies();

  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    // Fetch items for the current month OR previous items that are unpaid (pending or overdue)
    let query = supabase
      .from('payables')
      .select('*, category:categories(*), pdc:pdcs(*), loan:loan_schedule(*), payments:payment_history(*)')
      .or(`month_year.eq.${monthYear},and(month_year.lt.${monthYear},status.in.(pending,overdue,partial))`);

    if (filters.categoryId && filters.categoryId !== 'all') {
      query = query.eq('category_id', filters.categoryId);
    }
    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters.companyId && filters.companyId !== 'all') {
      query = query.eq('company_id', filters.companyId);
    }
    if (filters.search) {
      query = query.or(`title.ilike.%${filters.search}%,vendor_name.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;
    if (!error && data) {
      return data.map((p: any) => {
        const mappedPayments = (p.payments || []).map((item: any) => {
          let zohoPaymentId = item.zoho_payment_id || null;
          if (!zohoPaymentId && item.notes) {
            const match = item.notes.match(/\[ZOHO_PAYMENT:([a-zA-Z0-9_-]+)\]/);
            if (match) zohoPaymentId = match[1];
          }
          return { ...item, zoho_payment_id: zohoPaymentId };
        });
        return {
          ...p,
          company: companies.find(c => c.id === p.company_id) || companies[0],
          payments: mappedPayments
        };
      });
    }
  }

  // Fallback to local storage mock
  const db = getMockDb();
  let results = db.payables.filter((p) => {
    const isCurrentMonth = p.month_year === monthYear;
    const isPreviousUnpaid = p.month_year < monthYear && (p.status === 'pending' || p.status === 'overdue' || p.status === 'partial');
    return isCurrentMonth || isPreviousUnpaid;
  });

  if (filters.categoryId && filters.categoryId !== 'all') {
    results = results.filter((p) => p.category_id === filters.categoryId);
  }
  if (filters.status && filters.status !== 'all') {
    results = results.filter((p) => p.status === filters.status);
  }
  if (filters.companyId && filters.companyId !== 'all') {
    results = results.filter((p) => (p.company_id || 'comp-1') === filters.companyId);
  }
  if (filters.search) {
    const term = filters.search.toLowerCase();
    results = results.filter(
      (p) =>
        p.title.toLowerCase().includes(term) ||
        (p.vendor_name && p.vendor_name.toLowerCase().includes(term))
    );
  }

  // Attach full category & company objects for display
  return results.map(p => ({
    ...p,
    company: companies.find(c => c.id === p.company_id) || companies[0],
    category: db.categories.find(c => c.id === p.category_id),
    pdc: db.pdcs.find(pdc => pdc.payable_id === p.id),
    loan: db.loan_schedule.find(l => l.payable_id === p.id)
  })) as Payable[];
}

export async function getPayableById(id: string): Promise<Payable | null> {
  const companies = await getCompanies();
  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase
      .from('payables')
      .select('*, pdc:pdcs(*), loan:loan_schedule(*), payments:payment_history(*)')
      .eq('id', id)
      .single();
    if (!error && data) {
      return {
        ...data,
        company: companies.find(c => c.id === data.company_id) || companies[0]
      };
    }
  }

  const db = getMockDb();
  const payable = db.payables.find((p) => p.id === id);
  if (!payable) return null;

  return {
    ...payable,
    company: companies.find(c => c.id === payable.company_id) || companies[0],
    category: db.categories.find(c => c.id === payable.category_id),
    pdc: db.pdcs.find(pdc => pdc.payable_id === payable.id),
    loan: db.loan_schedule.find(l => l.payable_id === payable.id),
    payments: (db.payment_history || []).filter(ph => ph.payable_id === payable.id)
  } as Payable;
}

export async function createPayable(
  payableData: Omit<Payable, 'id' | 'created_at' | 'updated_at'> & {
    pdc?: Omit<PDC, 'id' | 'payable_id'> | null;
    loan?: Omit<LoanSchedule, 'id' | 'payable_id'> | null;
  }
): Promise<Payable> {
  const newId = typeof crypto !== 'undefined' ? crypto.randomUUID() : 'p-' + Math.random().toString(36).substr(2, 9);
  const now = new Date().toISOString();
  const payablesToCreate: Payable[] = [];

  // Special PDC sequence generator
  if (payableData.category_id === 'cat-4') {
    const pdcStartDateStr = payableData.pdc_start_date || payableData.due_date;
    const count = payableData.pdc_no_of_cheques || 1;

    let baseDate = new Date(pdcStartDateStr);
    if (isNaN(baseDate.getTime())) {
      baseDate = new Date();
    }

    const dates: Date[] = [];
    let currentDate = baseDate;
    for (let i = 0; i < count; i++) {
      dates.push(new Date(currentDate));
      currentDate = addMonths(currentDate, 1);
    }

    dates.forEach((date, i) => {
      const loopId = i === 0 ? newId : (typeof crypto !== 'undefined' ? crypto.randomUUID() : 'p-' + Math.random().toString(36).substr(2, 9));
      const loopMonthYear = format(date, 'yyyy-MM');
      const loopDueDateStr = format(date, 'yyyy-MM-dd');

      // Calculate incremented cheque number if it has numeric parts
      let chequeNo = payableData.pdc?.cheque_no || '';
      if (chequeNo && i > 0) {
        const match = chequeNo.match(/^(.*?)(\d+)$/);
        if (match) {
          const prefix = match[1];
          const digits = match[2];
          const incremented = String(Number(digits) + i).padStart(digits.length, '0');
          chequeNo = prefix + incremented;
        } else {
          chequeNo = chequeNo + '-' + (i + 1);
        }
      }

      // Append month-year description to title if there are multiple occurrences
      const finalTitle = dates.length > 1 ? `${payableData.title} - ${format(date, 'MMMM yyyy')}` : payableData.title;

      const singlePayable: Payable = {
        ...payableData,
        id: loopId,
        title: finalTitle,
        due_date: loopDueDateStr,
        month_year: loopMonthYear,
        created_at: now,
        updated_at: now,
        pdc: {
          id: typeof crypto !== 'undefined' ? crypto.randomUUID() : 'pdc-' + Math.random().toString(36).substr(2, 9),
          payable_id: loopId,
          cheque_no: chequeNo,
          bank_name: payableData.pdc?.bank_name || null,
          cheque_date: loopDueDateStr,
          presented_date: null,
          status: 'pending',
          reminder_days: payableData.pdc?.reminder_days || 3
        },
        loan: null
      };

      payablesToCreate.push(singlePayable);
    });
  }
  // Special Rent sequence generator
  else if (payableData.rent_start_month) {
    const rentStartMonth = payableData.rent_start_month;
    const rentSequence = payableData.rent_repeat_sequence || 'monthly';
    const dueDay = payableData.rent_due_day || 5;
    const count = payableData.pdc_no_of_cheques || (rentSequence === 'weekly' ? 12 : rentSequence === 'quarterly' ? 4 : 6);

    const startDateStr = `${rentStartMonth}-${String(dueDay).padStart(2, '0')}`;
    let baseDate = new Date(startDateStr);
    if (isNaN(baseDate.getTime())) {
      baseDate = new Date(`${rentStartMonth}-01`);
    }

    const dates: Date[] = [];
    let currentDate = baseDate;
    for (let i = 0; i < count; i++) {
      dates.push(new Date(currentDate));
      if (rentSequence === 'weekly') {
        currentDate = addWeeks(currentDate, 1);
      } else if (rentSequence === 'quarterly') {
        currentDate = addMonths(currentDate, 3);
      } else {
        currentDate = addMonths(currentDate, 1);
      }
    }

    dates.forEach((date, i) => {
      const loopId = i === 0 ? newId : (typeof crypto !== 'undefined' ? crypto.randomUUID() : 'p-' + Math.random().toString(36).substr(2, 9));
      const loopMonthYear = format(date, 'yyyy-MM');
      const loopDueDateStr = format(date, 'yyyy-MM-dd');

      // Append month-year description to title if there are multiple occurrences
      const finalTitle = dates.length > 1 ? `${payableData.title} - ${format(date, 'MMMM yyyy')}` : payableData.title;

      const singlePayable: Payable = {
        ...payableData,
        id: loopId,
        title: finalTitle,
        due_date: loopDueDateStr,
        month_year: loopMonthYear,
        created_at: now,
        updated_at: now,
        pdc: null,
        loan: null
      };

      payablesToCreate.push(singlePayable);
    });
  } else {
    // Standard non-rent recurring logic
    const recurrence = payableData.recurrence || 'once';
    const baseDueDate = new Date(payableData.due_date);

    let iterations = 1;
    let monthsInterval = 1;

    if (recurrence === 'monthly') {
      iterations = payableData.pdc_no_of_cheques || 6;
      monthsInterval = 1;
    } else if (recurrence === 'quarterly') {
      iterations = payableData.pdc_no_of_cheques || 4;
      monthsInterval = 3;
    } else if (recurrence === 'annual') {
      iterations = payableData.pdc_no_of_cheques || 2;
      monthsInterval = 12;
    }

    for (let i = 0; i < iterations; i++) {
      const loopId = i === 0 ? newId : (typeof crypto !== 'undefined' ? crypto.randomUUID() : 'p-' + Math.random().toString(36).substr(2, 9));
      const loopDueDate = i === 0 ? baseDueDate : addMonths(baseDueDate, i * monthsInterval);
      const loopMonthYear = format(loopDueDate, 'yyyy-MM');
      const loopDueDateStr = format(loopDueDate, 'yyyy-MM-dd');

      const singlePayable: Payable = {
        ...payableData,
        id: loopId,
        amount: (payableData.category_id === 'cat-8' && i > 0) ? 0 : payableData.amount,
        due_date: loopDueDateStr,
        month_year: loopMonthYear,
        created_at: now,
        updated_at: now,
        pdc: null,
        loan: null
      };

      if (payableData.pdc) {
        singlePayable.pdc = {
          id: typeof crypto !== 'undefined' ? crypto.randomUUID() : 'pdc-' + Math.random().toString(36).substr(2, 9),
          payable_id: loopId,
          cheque_no: payableData.pdc.cheque_no,
          bank_name: payableData.pdc.bank_name,
          cheque_date: i === 0 ? payableData.pdc.cheque_date : format(addMonths(new Date(payableData.pdc.cheque_date), i * monthsInterval), 'yyyy-MM-dd'),
          presented_date: null,
          status: 'pending'
        };
      }

      if (payableData.loan) {
        singlePayable.loan = {
          id: typeof crypto !== 'undefined' ? crypto.randomUUID() : 'loan-' + Math.random().toString(36).substr(2, 9),
          payable_id: loopId,
          installment_no: (payableData.loan.installment_no || 1) + i,
          principal: payableData.loan.principal,
          interest: payableData.loan.interest,
          balance_after: Math.max(0, (payableData.loan.balance_after || 0) - i * (payableData.loan.principal || 0))
        };
      }

      payablesToCreate.push(singlePayable);
    }
  }

  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();

    // Extract base payables mapping (omit relations: pdc, loan, category, company, payments)
    // and ensure only valid schema columns are included for Supabase table
    const dbPayables = payablesToCreate.map((p) => {
      const allowedCols: Record<string, any> = {
        id: p.id,
        title: p.title,
        category_id: p.category_id,
        company_id: p.company_id || null,
        vendor_name: p.vendor_name || null,
        amount: p.amount,
        currency: p.currency || 'OMR',
        due_date: p.due_date,
        payment_date: p.payment_date || null,
        status: p.status || 'pending',
        paid_amount: p.paid_amount || null,
        recurrence: p.recurrence || 'once',
        reference_no: p.reference_no || null,
        bank_account: p.bank_account || null,
        notes: p.notes || null,
        attachment_url: p.attachment_url || null,
        month_year: p.month_year,
        created_at: p.created_at,
        updated_at: p.updated_at,
        rent_start_month: p.rent_start_month || null,
        rent_repeat_sequence: p.rent_repeat_sequence || null,
        rent_due_day: p.rent_due_day || null,
        pdc_start_date: p.pdc_start_date || null,
        pdc_no_of_cheques: p.pdc_no_of_cheques || null
      };
      return allowedCols;
    });

    try {
      const { error: payablesError } = await supabase.from('payables').insert(dbPayables);
      if (payablesError) {
        console.error('Error inserting payables into Supabase:', {
          message: payablesError.message,
          code: payablesError.code,
          details: payablesError.details,
          hint: payablesError.hint
        });
        throw payablesError;
      }

      // Insert associated PDCs if they exist
      const pdcsToCreate = payablesToCreate
        .filter((p) => p.pdc)
        .map((p) => ({
          id: p.pdc!.id,
          payable_id: p.pdc!.payable_id,
          cheque_no: p.pdc!.cheque_no,
          bank_name: p.pdc!.bank_name || null,
          cheque_date: p.pdc!.cheque_date,
          presented_date: p.pdc!.presented_date || null,
          status: p.pdc!.status || 'pending',
          reminder_days: p.pdc!.reminder_days || 3
        }));

      if (pdcsToCreate.length > 0) {
        const { error: pdcsError } = await supabase.from('pdcs').insert(pdcsToCreate);
        if (pdcsError) {
          console.error('Error inserting PDCs into Supabase:', pdcsError);
        }
      }

      // Insert associated Loan schedules if they exist
      const loansToCreate = payablesToCreate
        .filter((p) => p.loan)
        .map((p) => ({
          id: p.loan!.id,
          payable_id: p.loan!.payable_id,
          installment_no: p.loan!.installment_no,
          principal: p.loan!.principal,
          interest: p.loan!.interest,
          balance_after: p.loan!.balance_after
        }));

      if (loansToCreate.length > 0) {
        const { error: loansError } = await supabase.from('loan_schedule').insert(loansToCreate);
        if (loansError) {
          console.error('Error inserting loan schedule into Supabase:', loansError);
        }
      }
    } catch (err) {
      console.warn('Supabase payable creation failed, persisting to local storage:', err);
    }
  }

  const db = getMockDb();
  const updatedList = [...db.payables, ...payablesToCreate];
  saveMockPayables(updatedList);

  return payablesToCreate[0];
}

export async function updatePayable(
  id: string,
  updatedFields: Partial<Payable> & {
    pdc?: Partial<PDC> | null;
    loan?: Partial<LoanSchedule> | null;
  }
): Promise<Payable> {
  const db = getMockDb();
  const index = db.payables.findIndex((p) => p.id === id);
  let original: Payable | null = index !== -1 ? db.payables[index] : null;

  if (!original) {
    original = await getPayableById(id);
    if (!original) {
      throw new Error('Payable not found');
    }
  }

  let finalPaidAmount = updatedFields.paid_amount;
  let finalPaymentDate = updatedFields.payment_date;

  if (updatedFields.status !== undefined || updatedFields.paid_amount !== undefined) {
    const syncRes = await syncPaymentHistoryOnStatusChange(
      id,
      original.status,
      updatedFields.status !== undefined ? updatedFields.status : original.status,
      updatedFields.amount !== undefined ? updatedFields.amount : original.amount,
      updatedFields.paid_amount,
      updatedFields.payment_date !== undefined ? updatedFields.payment_date : original.payment_date
    );
    finalPaidAmount = syncRes.newPaidAmount;
    finalPaymentDate = syncRes.newPaymentDate;
  }

  const fieldsToUpdate: Partial<Payable> = {
    ...updatedFields
  };

  if (finalPaidAmount !== undefined) {
    fieldsToUpdate.paid_amount = finalPaidAmount;
  }
  if (finalPaymentDate !== undefined) {
    fieldsToUpdate.payment_date = finalPaymentDate;
  }

  const now = new Date().toISOString();
  const updatedPayable: Payable = {
    ...original,
    ...fieldsToUpdate,
    updated_at: now
  } as Payable;

  if (updatedFields.pdc) {
    updatedPayable.pdc = {
      ...(original.pdc || {
        id: typeof crypto !== 'undefined' ? crypto.randomUUID() : 'pdc-' + Math.random().toString(36).substr(2, 9),
        payable_id: id,
        presented_date: null,
        status: 'pending'
      }),
      ...updatedFields.pdc
    } as PDC;
  } else if (updatedFields.pdc === null) {
    updatedPayable.pdc = null;
  }

  if (updatedFields.loan) {
    updatedPayable.loan = {
      ...(original.loan || {
        id: typeof crypto !== 'undefined' ? crypto.randomUUID() : 'loan-' + Math.random().toString(36).substr(2, 9),
        payable_id: id,
        installment_no: 1,
        principal: 0,
        interest: 0,
        balance_after: 0
      }),
      ...updatedFields.loan
    } as LoanSchedule;
  } else if (updatedFields.loan === null) {
    updatedPayable.loan = null;
  }

  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();

    // Extract base payable fields (excluding relations: pdc, loan, category, company, payments)
    const { pdc: pdcUpdate, loan: loanUpdate, category: _category, company: _company, payments: _payments, ...payableFields } = fieldsToUpdate;

    const allowedUpdateCols: Record<string, any> = {};
    const validKeys = [
      'title', 'category_id', 'company_id', 'vendor_name', 'amount', 'currency',
      'due_date', 'payment_date', 'status', 'paid_amount', 'recurrence',
      'reference_no', 'bank_account', 'notes', 'attachment_url', 'month_year',
      'rent_start_month', 'rent_repeat_sequence', 'rent_due_day',
      'pdc_start_date', 'pdc_no_of_cheques'
    ];
    for (const key of validKeys) {
      if ((payableFields as any)[key] !== undefined) {
        allowedUpdateCols[key] = (payableFields as any)[key];
      }
    }

    try {
      if (Object.keys(allowedUpdateCols).length > 0) {
        const { error: payableError } = await supabase
          .from('payables')
          .update({ ...allowedUpdateCols, updated_at: now })
          .eq('id', id);
        if (payableError) {
          console.error('Error updating payable in Supabase:', payableError);
        }
      }

      if (pdcUpdate) {
        const finalPdc = updatedPayable.pdc!;
        const { error: pdcError } = await supabase
          .from('pdcs')
          .upsert({
            id: finalPdc.id,
            payable_id: finalPdc.payable_id,
            cheque_no: finalPdc.cheque_no,
            bank_name: finalPdc.bank_name || null,
            cheque_date: finalPdc.cheque_date,
            presented_date: finalPdc.presented_date || null,
            status: finalPdc.status || 'pending',
            reminder_days: finalPdc.reminder_days || 3
          });
        if (pdcError) {
          console.error('Error updating/upserting PDC in Supabase:', pdcError);
        }
      } else if (pdcUpdate === null) {
        const { error: pdcDeleteError } = await supabase
          .from('pdcs')
          .delete()
          .eq('payable_id', id);
        if (pdcDeleteError) {
          console.error('Error deleting PDC in Supabase:', pdcDeleteError);
        }
      }

      if (loanUpdate) {
        const finalLoan = updatedPayable.loan!;
        const { error: loanError } = await supabase
          .from('loan_schedule')
          .upsert({
            id: finalLoan.id,
            payable_id: finalLoan.payable_id,
            installment_no: finalLoan.installment_no,
            principal: finalLoan.principal,
            interest: finalLoan.interest,
            balance_after: finalLoan.balance_after
          });
        if (loanError) {
          console.error('Error updating/upserting loan schedule in Supabase:', loanError);
        }
      } else if (loanUpdate === null) {
        const { error: loanDeleteError } = await supabase
          .from('loan_schedule')
          .delete()
          .eq('payable_id', id);
        if (loanDeleteError) {
          console.error('Error deleting loan schedule in Supabase:', loanDeleteError);
        }
      }
    } catch (err) {
      console.warn('Supabase payable update failed, persisting locally:', err);
    }
  }

  if (index !== -1) {
    db.payables[index] = updatedPayable;
  } else {
    db.payables.push(updatedPayable);
  }
  saveMockPayables(db.payables);

  return updatedPayable;
}

export async function deletePayable(id: string, deleteAllOccurrences: boolean = false): Promise<boolean> {
  const target = await getPayableById(id);
  if (!target) return false;

  // Clean up payment history and void/delete linked Zoho Books payments
  try {
    await clearPaymentHistory(id);
  } catch (e) {
    console.warn('Error clearing payment history for deleted payable:', e);
  }

  const baseTargetTitle = target.title.split(' - ')[0].trim();

  const db = getMockDb();

  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    if (deleteAllOccurrences) {
      // 1. Delete by timestamp window if created_at is present
      if (target.created_at) {
        const targetTime = new Date(target.created_at).getTime();
        const startTime = new Date(targetTime - 2000).toISOString();
        const endTime = new Date(targetTime + 2000).toISOString();

        const { error: err1 } = await supabase
          .from('payables')
          .delete()
          .gte('created_at', startTime)
          .lte('created_at', endTime);
        if (err1) {
          console.error('Error deleting multi-occurrence payables from Supabase by timestamp:', err1);
        }
      }

      // 2. Fallback/Complementary delete by base title pattern, category, and vendor
      const titlePattern = `${baseTargetTitle}%`;
      const query = supabase
        .from('payables')
        .delete()
        .eq('category_id', target.category_id)
        .ilike('title', titlePattern);

      let error;
      if (target.vendor_name) {
        const res = await query.eq('vendor_name', target.vendor_name);
        error = res.error;
      } else {
        const res = await query.is('vendor_name', null);
        error = res.error;
      }
      if (error) {
        console.error('Error deleting multi-occurrence payables from Supabase by title:', error);
        throw error;
      }
    } else {
      const { error } = await supabase.from('payables').delete().eq('id', id);
      if (error) {
        console.error('Error deleting payable from Supabase:', error);
        throw error;
      }
    }
  }

  const countBefore = db.payables.length;
  let filtered;
  if (deleteAllOccurrences) {
    const targetTime = target.created_at ? new Date(target.created_at).getTime() : null;
    filtered = db.payables.filter((p) => {
      // Match by timestamp window if both have created_at
      if (targetTime && p.created_at) {
        const timeDiff = Math.abs(new Date(p.created_at).getTime() - targetTime);
        if (timeDiff <= 2000) return false; // Delete
      }

      // Fallback: match by base title, category, and vendor
      const basePTitle = p.title.split(' - ')[0].trim();
      const titlesMatch = basePTitle === baseTargetTitle;
      const categoriesMatch = p.category_id === target.category_id;
      const vendorsMatch = (p.vendor_name || '') === (target.vendor_name || '');

      if (titlesMatch && categoriesMatch && vendorsMatch) {
        return false; // Delete
      }

      return true; // Keep
    });
  } else {
    filtered = db.payables.filter((p) => p.id !== id);
  }
  saveMockPayables(filtered);
  return filtered.length < countBefore;
}

export async function updatePayableStatus(
  id: string,
  status: Payable['status'],
  paymentDate: string | null = null,
  paidAmount: number | null = null,
  newAmount: number | null = null
): Promise<Payable> {
  const payable = await getPayableById(id);
  const amt = newAmount !== null ? newAmount : (payable?.amount || 0);
  return updatePayable(id, {
    status,
    amount: amt,
    payment_date: (status === 'paid' || status === 'partial') ? (paymentDate || format(new Date(), 'yyyy-MM-dd')) : null,
    paid_amount: status === 'paid' ? amt : (status === 'partial' ? paidAmount : null)
  });
}

export async function getPdcs(filters: { status?: string; companyId?: string } = {}): Promise<Payable[]> {
  const companies = await getCompanies();
  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    let query = supabase
      .from('payables')
      .select('*, category:categories(*), pdc:pdcs(*)');

    if (filters.companyId && filters.companyId !== 'all') {
      query = query.eq('company_id', filters.companyId);
    }

    const { data, error } = await query;

    if (!error && data) {
      // Filter in JS to find payables with PDC
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let results = (data as any[]).filter(p => p.category_id === 'cat-4' || p.pdc);

      if (filters.status && filters.status !== 'all') {
        results = results.filter(p => p.pdc?.status === filters.status);
      }

      return results.map(p => ({
        ...p,
        company: companies.find(c => c.id === p.company_id) || companies[0]
      })) as Payable[];
    }
  }

  const db = getMockDb();
  let payablesWithPdc = db.payables.filter((p) => p.category_id === 'cat-4' || p.pdc);

  // Parse filters
  if (filters.companyId && filters.companyId !== 'all') {
    payablesWithPdc = payablesWithPdc.filter(p => (p.company_id || 'comp-1') === filters.companyId);
  }
  if (filters.status && filters.status !== 'all') {
    payablesWithPdc = payablesWithPdc.filter((p) => p.pdc?.status === filters.status);
  }

  return payablesWithPdc.map(p => ({
    ...p,
    company: companies.find(c => c.id === p.company_id) || companies[0],
    category: db.categories.find(c => c.id === p.category_id),
    pdc: db.pdcs.find(pdc => pdc.payable_id === p.id) || p.pdc
  })) as Payable[];
}

export async function updatePdcStatus(
  payableId: string,
  status: PDC['status'],
  presentedDate: string | null = null
): Promise<Payable> {
  const payable = await getPayableById(payableId);
  if (!payable || !payable.pdc) throw new Error('PDC record not found');

  const updatedPdc: PDC = {
    ...payable.pdc,
    status,
    presented_date: (status === 'presented' || status === 'cleared')
      ? (presentedDate || format(new Date(), 'yyyy-MM-dd'))
      : null
  };

  // If PDC status becomes 'cleared', mark the main payable as 'paid'
  const payableStatusUpdate: Partial<Payable> = {
    pdc: updatedPdc
  };

  if (status === 'cleared') {
    payableStatusUpdate.status = 'paid';
    payableStatusUpdate.payment_date = updatedPdc.presented_date || format(new Date(), 'yyyy-MM-dd');
  } else if (status === 'bounced') {
    payableStatusUpdate.status = 'pending';
    payableStatusUpdate.payment_date = null;
  }

  return updatePayable(payableId, payableStatusUpdate);
}

export async function getReports(
  startMonth: string, 
  endMonth: string, 
  filters: { companyId?: string } = {}
): Promise<Payable[]> {
  const companies = await getCompanies();
  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    let query = supabase
      .from('payables')
      .select('*, category:categories(*), pdc:pdcs(*), loan:loan_schedule(*)')
      .or(`and(month_year.gte.${startMonth},month_year.lte.${endMonth}),and(month_year.lt.${startMonth},status.in.(pending,overdue,partial))`);

    if (filters.companyId && filters.companyId !== 'all') {
      query = query.eq('company_id', filters.companyId);
    }

    const { data, error } = await query;
    if (!error && data) {
      return (data as any[]).map((p: any) => ({
        ...p,
        company: companies.find(c => c.id === p.company_id) || companies[0]
      })) as Payable[];
    }
  }

  const db = getMockDb();

  // Filter payables that fall within month range inclusive or previous unpaid items
  let results = db.payables.filter((p) => {
    const inRange = p.month_year >= startMonth && p.month_year <= endMonth;
    const isPreviousUnpaid = p.month_year < startMonth && (p.status === 'pending' || p.status === 'overdue' || p.status === 'partial');
    return inRange || isPreviousUnpaid;
  });

  if (filters.companyId && filters.companyId !== 'all') {
    results = results.filter(p => (p.company_id || 'comp-1') === filters.companyId);
  }

  return results.map(p => ({
    ...p,
    company: companies.find(c => c.id === p.company_id) || companies[0],
    category: db.categories.find(c => c.id === p.category_id),
    pdc: db.pdcs.find(pdc => pdc.payable_id === p.id),
    loan: db.loan_schedule.find(l => l.payable_id === p.id)
  })) as Payable[];
}

export async function getAllPayables(filters: { companyId?: string } = {}): Promise<Payable[]> {
  const companies = await getCompanies();
  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    let query = supabase
      .from('payables')
      .select('*, category:categories(*), pdc:pdcs(*), loan:loan_schedule(*)');

    if (filters.companyId && filters.companyId !== 'all') {
      query = query.eq('company_id', filters.companyId);
    }

    const { data, error } = await query;
    if (!error && data) {
      return (data as any[]).map((p: any) => ({
        ...p,
        company: companies.find(c => c.id === p.company_id) || companies[0]
      })) as Payable[];
    }
  }

  const db = getMockDb();
  let list = db.payables;
  if (filters.companyId && filters.companyId !== 'all') {
    list = list.filter(p => (p.company_id || 'comp-1') === filters.companyId);
  }

  return list.map(p => ({
    ...p,
    company: companies.find(c => c.id === p.company_id) || companies[0],
    category: db.categories.find(c => c.id === p.category_id),
    pdc: db.pdcs.find(pdc => pdc.payable_id === p.id),
    loan: db.loan_schedule.find(l => l.payable_id === p.id)
  })) as Payable[];
}

export async function getVendors(): Promise<Vendor[]> {
  const db = getMockDb();
  let vendorsList: Vendor[] = [];

  if (!shouldUseMock()) {
    try {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.from('vendors').select('*').order('name');
      if (!error && data && data.length > 0) {
        vendorsList = data;
      }
    } catch (e) {
      console.warn('Error fetching Supabase vendors, using local:', e);
    }
  }

  if (vendorsList.length === 0) {
    vendorsList = db.vendors;
  }

  // Calculate live payables balance for every vendor from all database payables
  let allPayables: Payable[] = [];
  try {
    allPayables = await getAllPayables();
  } catch (e) {
    allPayables = db.payables;
  }

  // Build vendor payables aggregation map
  const vendorStatsMap = new Map<string, {
    totalInvoiced: number;
    totalPaid: number;
    totalPending: number;
    billsCount: number;
    unpaidBillsCount: number;
  }>();

  allPayables.forEach((p) => {
    const vName = (p.vendor_name || '').trim().toLowerCase();
    if (!vName) return;

    const stat = vendorStatsMap.get(vName) || {
      totalInvoiced: 0,
      totalPaid: 0,
      totalPending: 0,
      billsCount: 0,
      unpaidBillsCount: 0
    };

    const amt = Number(p.amount) || 0;
    const paidAmt = p.status === 'paid' ? amt : (Number(p.paid_amount) || 0);
    const pendingAmt = p.status === 'paid' || p.status === 'cancelled' ? 0 : Math.max(0, amt - (Number(p.paid_amount) || 0));

    stat.totalInvoiced += amt;
    stat.totalPaid += paidAmt;
    stat.totalPending += pendingAmt;
    stat.billsCount += 1;
    if (pendingAmt > 0) stat.unpaidBillsCount += 1;

    vendorStatsMap.set(vName, stat);
  });

  return vendorsList.map((v) => {
    const vNameKey = (v.name || '').trim().toLowerCase();
    const stats = vendorStatsMap.get(vNameKey);
    const localMatch = db.vendors.find(lv => lv.id === v.id || lv.name.toLowerCase().trim() === vNameKey);

    const calculatedPending = stats ? Number(stats.totalPending.toFixed(3)) : 0;
    const existingOutstanding = Number(v.outstanding_payable_amount || localMatch?.outstanding_payable_amount || 0);
    const finalOutstanding = calculatedPending > 0 ? calculatedPending : existingOutstanding;

    return {
      ...v,
      zoho_contact_id: v.zoho_contact_id !== undefined ? v.zoho_contact_id : (localMatch?.zoho_contact_id || null),
      outstanding_payable_amount: finalOutstanding,
      unused_credits_payable_amount: v.unused_credits_payable_amount !== undefined ? v.unused_credits_payable_amount : (localMatch?.unused_credits_payable_amount || 0),
      zoho_last_synced_at: v.zoho_last_synced_at !== undefined ? v.zoho_last_synced_at : (localMatch?.zoho_last_synced_at || null)
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export async function createVendor(vendorData: Omit<Vendor, 'id'>): Promise<Vendor> {
  const newId = typeof crypto !== 'undefined' ? crypto.randomUUID() : 'v-' + Math.random().toString(36).substr(2, 9);
  const newVendor: Vendor = {
    ...vendorData,
    id: newId,
    created_at: new Date().toISOString()
  };

  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    const { error } = await supabase.from('vendors').insert(newVendor);
    if (error) {
      console.error('Error inserting vendor into Supabase:', error);
      throw error;
    }
  }

  const db = getMockDb();
  const updatedList = [...db.vendors, newVendor];
  saveMockVendors(updatedList);
  return newVendor;
}

export async function updateVendor(id: string, vendorData: Partial<Omit<Vendor, 'id' | 'created_at'>>): Promise<Vendor> {
  const db = getMockDb();
  const index = db.vendors.findIndex(v => v.id === id);

  let original: Vendor = { id, name: '' };
  if (index !== -1) {
    original = db.vendors[index];
  }

  const updatedVendor: Vendor = {
    ...original,
    ...vendorData,
  };

  if (!shouldUseMock()) {
    try {
      const supabase = createBrowserSupabase();
      const { error } = await supabase
        .from('vendors')
        .update(vendorData)
        .eq('id', id);
      if (error) {
        console.warn('Supabase vendor update warning (using local fallback):', error.message);
      }
    } catch (e) {
      console.warn('Supabase vendor update failed, saved locally:', e);
    }
  }

  if (index !== -1) {
    db.vendors[index] = updatedVendor;
  } else {
    db.vendors.push(updatedVendor);
  }
  saveMockVendors(db.vendors);
  return updatedVendor;
}

export async function deleteVendor(id: string): Promise<boolean> {
  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    const { error } = await supabase.from('vendors').delete().eq('id', id);
    if (error) {
      console.error('Error deleting vendor from Supabase:', error);
      throw error;
    }
  }

  const db = getMockDb();
  const countBefore = db.vendors.length;
  const filtered = db.vendors.filter(v => v.id !== id);
  saveMockVendors(filtered);
  return filtered.length < countBefore;
}

export async function getEmployees(): Promise<Employee[]> {
  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase.from('employees').select('*').order('name');
    if (!error && data) return data;
  }
  return getMockDb().employees.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createEmployee(employeeData: Omit<Employee, 'id'>): Promise<Employee> {
  const newId = typeof crypto !== 'undefined' ? crypto.randomUUID() : 'e-' + Math.random().toString(36).substr(2, 9);
  const newEmployee: Employee = {
    ...employeeData,
    id: newId,
    created_at: new Date().toISOString()
  };

  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    await supabase.from('employees').insert(newEmployee);
  }

  const db = getMockDb();
  const updatedList = [...db.employees, newEmployee];
  saveMockEmployees(updatedList);
  return newEmployee;
}

export async function updateEmployee(
  id: string,
  employeeData: Partial<Omit<Employee, 'id' | 'created_at'>>
): Promise<Employee> {
  const db = getMockDb();
  const index = db.employees.findIndex(e => e.id === id);

  let original: Employee = { id, name: '' };
  if (index !== -1) {
    original = db.employees[index];
  }

  const updatedEmployee: Employee = {
    ...original,
    ...employeeData,
  };

  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    const { error } = await supabase
      .from('employees')
      .update(employeeData)
      .eq('id', id);
    if (error) {
      console.error('Error updating employee in Supabase:', error);
      throw error;
    }
  }

  if (index !== -1) {
    db.employees[index] = updatedEmployee;
  } else {
    db.employees.push(updatedEmployee);
  }
  saveMockEmployees(db.employees);
  return updatedEmployee;
}

export async function deleteEmployee(id: string): Promise<boolean> {
  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    const { error } = await supabase.from('employees').delete().eq('id', id);
    if (error) {
      console.error('Error deleting employee from Supabase:', error);
      throw error;
    }
  }

  const db = getMockDb();
  const countBefore = db.employees.length;
  const filtered = db.employees.filter(e => e.id !== id);
  saveMockEmployees(filtered);
  return filtered.length < countBefore;
}

// Landowners CRUD Operations

export async function getLandowners(): Promise<Landowner[]> {
  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase.from('landowners').select('*').order('name');
    if (!error && data) return data;
  }
  return getMockDb().landowners.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createLandowner(landownerData: Omit<Landowner, 'id'>): Promise<Landowner> {
  const newId = typeof crypto !== 'undefined' ? crypto.randomUUID() : 'l-' + Math.random().toString(36).substr(2, 9);
  const newLandowner: Landowner = {
    ...landownerData,
    id: newId,
    created_at: new Date().toISOString()
  };

  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    const { error } = await supabase.from('landowners').insert(newLandowner);
    if (error) {
      console.error('Error inserting landowner into Supabase:', error);
      throw error;
    }
  }

  const db = getMockDb();
  const updatedList = [...db.landowners, newLandowner];
  saveMockLandowners(updatedList);
  return newLandowner;
}

export async function updateLandowner(
  id: string,
  landownerData: Partial<Omit<Landowner, 'id' | 'created_at'>>
): Promise<Landowner> {
  const db = getMockDb();
  const index = db.landowners.findIndex(l => l.id === id);

  let original: Landowner = { id, name: '' };
  if (index !== -1) {
    original = db.landowners[index];
  }

  const updatedLandowner: Landowner = {
    ...original,
    ...landownerData,
  };

  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    const { error } = await supabase
      .from('landowners')
      .update(landownerData)
      .eq('id', id);
    if (error) {
      console.error('Error updating landowner in Supabase:', error);
      throw error;
    }
  }

  if (index !== -1) {
    db.landowners[index] = updatedLandowner;
  } else {
    db.landowners.push(updatedLandowner);
  }
  saveMockLandowners(db.landowners);
  return updatedLandowner;
}

export async function deleteLandowner(id: string): Promise<boolean> {
  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    const { error } = await supabase.from('landowners').delete().eq('id', id);
    if (error) {
      console.error('Error deleting landowner from Supabase:', error);
      throw error;
    }
  }

  const db = getMockDb();
  const countBefore = db.landowners.length;
  const filtered = db.landowners.filter(l => l.id !== id);
  saveMockLandowners(filtered);
  return filtered.length < countBefore;
}

// Payment History CRUD & Management Functions

export async function getPaymentHistory(payableId: string): Promise<PaymentHistory[]> {
  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase
      .from('payment_history')
      .select('*')
      .eq('payable_id', payableId)
      .order('payment_date', { ascending: false });
    if (!error && data) {
      return data.map((item: any) => {
        let zohoPaymentId = item.zoho_payment_id || null;
        if (!zohoPaymentId && item.notes) {
          const match = item.notes.match(/\[ZOHO_PAYMENT:([a-zA-Z0-9_-]+)\]/);
          if (match) zohoPaymentId = match[1];
        }
        return {
          ...item,
          zoho_payment_id: zohoPaymentId
        };
      });
    }
  }
  const db = getMockDb();
  return (db.payment_history || [])
    .filter((ph) => ph.payable_id === payableId)
    .sort((a, b) => b.payment_date.localeCompare(a.payment_date));
}

/**
 * Helper to dispatch vendor payment creation to Zoho Books in background/online mode
 */
export async function syncVendorPaymentToZoho(params: {
  payableId: string;
  amount: number;
  paymentDate: string;
  referenceNo?: string | null;
  notes?: string | null;
}): Promise<{ zoho_payment_id?: string; error?: string }> {
  try {
    const res = await fetch('/api/zoho/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payable_id: params.payableId,
        amount: params.amount,
        payment_date: params.paymentDate,
        reference_no: params.referenceNo,
        notes: params.notes
      })
    });
    const data = await res.json();
    if (data.success && data.data?.zoho_payment_id) {
      return { zoho_payment_id: data.data.zoho_payment_id };
    } else {
      return { error: data.error || 'Failed to sync with Zoho Books' };
    }
  } catch (err: any) {
    return { error: err.message || 'Network error syncing with Zoho Books' };
  }
}

/**
 * Helper to delete vendor payment from Zoho Books
 */
export async function deleteVendorPaymentFromZoho(zohoPaymentId: string): Promise<boolean> {
  if (!zohoPaymentId) return false;
  try {
    const res = await fetch(`/api/zoho/payments?payment_id=${encodeURIComponent(zohoPaymentId)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (err) {
    console.warn('Failed to delete payment from Zoho Books:', err);
    return false;
  }
}

export async function addPaymentRecord(
  payment: Omit<PaymentHistory, 'id' | 'created_at'>,
  options: { syncZoho?: boolean } = { syncZoho: true }
): Promise<Payable> {
  const newId = typeof crypto !== 'undefined' ? crypto.randomUUID() : 'pay-' + Math.random().toString(36).substr(2, 9);
  const now = new Date().toISOString();
  
  let zohoPaymentId = payment.zoho_payment_id || null;
  let zohoSyncedAt = payment.zoho_synced_at || null;

  // If syncZoho is true and not already provided, attempt sync with Zoho Books
  if (options.syncZoho !== false && !zohoPaymentId && typeof window !== 'undefined') {
    try {
      const zohoRes = await syncVendorPaymentToZoho({
        payableId: payment.payable_id,
        amount: payment.amount,
        paymentDate: payment.payment_date,
        referenceNo: payment.reference_no,
        notes: payment.notes
      });
      if (zohoRes.zoho_payment_id) {
        zohoPaymentId = zohoRes.zoho_payment_id;
        zohoSyncedAt = now;
      }
    } catch (e) {
      console.warn('Zoho payment sync skipped or failed:', e);
    }
  }

  // Embed Zoho payment tag in notes to preserve linkage safely in Supabase payment_history
  let finalNotes = payment.notes || '';
  if (zohoPaymentId && !finalNotes.includes(`[ZOHO_PAYMENT:${zohoPaymentId}]`)) {
    finalNotes = `${finalNotes ? finalNotes + ' ' : ''}[ZOHO_PAYMENT:${zohoPaymentId}]`.trim();
  }

  const newPayment: PaymentHistory = {
    ...payment,
    notes: finalNotes || null,
    id: newId,
    zoho_payment_id: zohoPaymentId,
    zoho_synced_at: zohoSyncedAt,
    created_at: now
  };

  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    // Only pass existing columns in Supabase payment_history to prevent schema errors
    const dbPayload = {
      id: newPayment.id,
      payable_id: newPayment.payable_id,
      amount: newPayment.amount,
      payment_date: newPayment.payment_date,
      reference_no: newPayment.reference_no,
      bank_account: newPayment.bank_account,
      notes: newPayment.notes,
      created_at: newPayment.created_at
    };
    try {
      const { error: insertError } = await supabase
        .from('payment_history')
        .insert(dbPayload);
      if (insertError) {
        console.error('Error inserting payment record into Supabase:', insertError);
      }
    } catch (err) {
      console.warn('Supabase payment insert failed, persisting locally:', err);
    }
  }

  const db = getMockDb();
  const historyList = [...(db.payment_history || []), newPayment];
  saveMockPaymentHistory(historyList);

  return recalculatePayableStatusAndPaidAmount(payment.payable_id);
}

export async function deletePaymentRecord(paymentId: string, payableId: string): Promise<Payable> {
  // Check if there is an associated zoho_payment_id to remove from Zoho Books
  let targetZohoPaymentId: string | null = null;
  const history = await getPaymentHistory(payableId);
  const targetPayment = history.find(p => p.id === paymentId);
  if (targetPayment?.zoho_payment_id) {
    targetZohoPaymentId = targetPayment.zoho_payment_id;
  }

  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    const { error: deleteError } = await supabase
      .from('payment_history')
      .delete()
      .eq('id', paymentId);
    if (deleteError) {
      console.error('Error deleting payment record:', deleteError);
      throw deleteError;
    }
  } else {
    const db = getMockDb();
    const filtered = (db.payment_history || []).filter((ph) => ph.id !== paymentId);
    saveMockPaymentHistory(filtered);
  }

  // Delete from Zoho Books asynchronously
  if (targetZohoPaymentId && typeof window !== 'undefined') {
    deleteVendorPaymentFromZoho(targetZohoPaymentId).catch(err => {
      console.warn('Error deleting payment in Zoho:', err);
    });
  }

  return recalculatePayableStatusAndPaidAmount(payableId);
}

async function createRawPaymentRecord(payment: {
  payable_id: string;
  amount: number;
  payment_date: string;
  reference_no?: string | null;
  bank_account?: string | null;
  notes?: string | null;
  zoho_payment_id?: string | null;
  zoho_synced_at?: string | null;
}): Promise<PaymentHistory> {
  const newId = typeof crypto !== 'undefined' ? crypto.randomUUID() : 'pay-' + Math.random().toString(36).substr(2, 9);
  const now = new Date().toISOString();
  
  let finalNotes = payment.notes || '';
  if (payment.zoho_payment_id && !finalNotes.includes(`[ZOHO_PAYMENT:${payment.zoho_payment_id}]`)) {
    finalNotes = `${finalNotes ? finalNotes + ' ' : ''}[ZOHO_PAYMENT:${payment.zoho_payment_id}]`.trim();
  }

  const newPayment: PaymentHistory = {
    ...payment,
    notes: finalNotes || null,
    id: newId,
    created_at: now
  };

  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    const dbPayload = {
      id: newPayment.id,
      payable_id: newPayment.payable_id,
      amount: newPayment.amount,
      payment_date: newPayment.payment_date,
      reference_no: newPayment.reference_no,
      bank_account: newPayment.bank_account,
      notes: newPayment.notes,
      created_at: newPayment.created_at
    };
    const { error } = await supabase.from('payment_history').insert(dbPayload);
    if (error) {
      console.error('Error inserting raw payment record:', error);
      throw error;
    }
  } else {
    const db = getMockDb();
    const historyList = [...(db.payment_history || []), newPayment];
    saveMockPaymentHistory(historyList);
  }

  return newPayment;
}

async function clearPaymentHistory(payableId: string): Promise<void> {
  const existingPayments = await getPaymentHistory(payableId);

  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    const { error } = await supabase.from('payment_history').delete().eq('payable_id', payableId);
    if (error) {
      console.error('Error clearing payment history:', error);
      throw error;
    }
  } else {
    const db = getMockDb();
    const filtered = (db.payment_history || []).filter((ph) => ph.payable_id !== payableId);
    saveMockPaymentHistory(filtered);
  }

  // Also clean up any Zoho payments linked to this payable
  if (typeof window !== 'undefined') {
    for (const p of existingPayments) {
      if (p.zoho_payment_id) {
        deleteVendorPaymentFromZoho(p.zoho_payment_id).catch(() => {});
      }
    }
  }
}

async function syncPaymentHistoryOnStatusChange(
  payableId: string,
  oldStatus: Payable['status'],
  newStatus: Payable['status'],
  newAmount: number,
  newPaidAmount: number | null | undefined,
  paymentDate: string | null
): Promise<{ newPaidAmount: number | null; newPaymentDate: string | null }> {
  const payments = await getPaymentHistory(payableId);
  const sum = payments.reduce((s, p) => s + Number(p.amount), 0);

  let finalPaidAmount = newPaidAmount !== undefined ? newPaidAmount : sum;
  let finalPaymentDate = paymentDate;

  if (newStatus === 'paid') {
    const diff = newAmount - sum;
    if (diff > 0) {
      const pDate = paymentDate || format(new Date(), 'yyyy-MM-dd');
      let zohoPaymentId: string | null = null;
      let zohoSyncedAt: string | null = null;
      if (typeof window !== 'undefined') {
        try {
          const zohoRes = await syncVendorPaymentToZoho({
            payableId,
            amount: diff,
            paymentDate: pDate,
            notes: 'Full payment status update'
          });
          if (zohoRes.zoho_payment_id) {
            zohoPaymentId = zohoRes.zoho_payment_id;
            zohoSyncedAt = new Date().toISOString();
          }
        } catch (e) {}
      }

      await createRawPaymentRecord({
        payable_id: payableId,
        amount: diff,
        payment_date: pDate,
        notes: 'Full payment status update',
        zoho_payment_id: zohoPaymentId,
        zoho_synced_at: zohoSyncedAt
      });
      finalPaidAmount = newAmount;
      finalPaymentDate = pDate;
    } else {
      finalPaidAmount = sum > 0 ? sum : newAmount;
      finalPaymentDate = paymentDate || (payments.length > 0 ? payments[0].payment_date : format(new Date(), 'yyyy-MM-dd'));
    }
  } else if (['pending', 'cancelled', 'overdue'].includes(newStatus)) {
    if (payments.length > 0) {
      await clearPaymentHistory(payableId);
    }
    finalPaidAmount = null;
    finalPaymentDate = null;
  } else if (newStatus === 'partial') {
    if (newPaidAmount !== undefined && newPaidAmount !== null) {
      const diff = newPaidAmount - sum;
      if (Math.abs(diff) > 0.001) {
        await clearPaymentHistory(payableId);
        const pDate = paymentDate || format(new Date(), 'yyyy-MM-dd');
        let zohoPaymentId: string | null = null;
        let zohoSyncedAt: string | null = null;
        if (typeof window !== 'undefined') {
          try {
            const zohoRes = await syncVendorPaymentToZoho({
              payableId,
              amount: newPaidAmount,
              paymentDate: pDate,
              notes: 'Status update sync'
            });
            if (zohoRes.zoho_payment_id) {
              zohoPaymentId = zohoRes.zoho_payment_id;
              zohoSyncedAt = new Date().toISOString();
            }
          } catch (e) {}
        }

        await createRawPaymentRecord({
          payable_id: payableId,
          amount: newPaidAmount,
          payment_date: pDate,
          notes: 'Status update sync',
          zoho_payment_id: zohoPaymentId,
          zoho_synced_at: zohoSyncedAt
        });
        finalPaidAmount = newPaidAmount;
        finalPaymentDate = pDate;
      }
    } else {
      finalPaidAmount = sum > 0 ? sum : 0;
      finalPaymentDate = paymentDate || (payments.length > 0 ? payments[0].payment_date : null);
    }
  }

  return {
    newPaidAmount: finalPaidAmount,
    newPaymentDate: finalPaymentDate
  };
}

async function recalculatePayableStatusAndPaidAmount(payableId: string): Promise<Payable> {
  const payable = await getPayableById(payableId);
  if (!payable) {
    throw new Error('Payable not found');
  }

  const payments = await getPaymentHistory(payableId);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  let newStatus: Payable['status'] = 'partial';
  if (totalPaid >= payable.amount) {
    newStatus = 'paid';
  } else if (totalPaid <= 0) {
    const today = format(new Date(), 'yyyy-MM-dd');
    newStatus = payable.due_date < today ? 'overdue' : 'pending';
  }

  let latestPaymentDate = null;
  if (payments.length > 0) {
    const sorted = [...payments].sort((a, b) => b.payment_date.localeCompare(a.payment_date));
    latestPaymentDate = sorted[0].payment_date;
  }

  const updated = await updatePayable(payableId, {
    status: newStatus,
    paid_amount: totalPaid > 0 ? totalPaid : null,
    payment_date: latestPaymentDate
  });

  return updated;
}

