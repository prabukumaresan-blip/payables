import { isSupabaseConfigured, createClient as createBrowserSupabase } from './client';
import { getMockDb, saveMockPayables, saveMockVendors, saveMockEmployees, SEEDED_CATEGORIES, Payable, PDC, Category, LoanSchedule, Vendor, Employee } from './mockDb';
import { format, parse, addMonths, compareAsc, addWeeks, endOfMonth } from 'date-fns';

// Helper to determine if we should use mock database
const useMock = () => {
  return !isSupabaseConfigured();
};

export async function getCategories(): Promise<Category[]> {
  if (!useMock()) {
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase.from('categories').select('*');
    if (!error && data) return data;
  }
  return getMockDb().categories;
}

export async function getPayables(
  monthYear: string,
  filters: { categoryId?: string; status?: string; search?: string } = {}
): Promise<Payable[]> {
  if (!useMock()) {
    const supabase = createBrowserSupabase();
    // Fetch items for the current month OR previous items that are unpaid (pending or overdue)
    let query = supabase
      .from('payables')
      .select('*, category:categories(*), pdc:pdcs(*), loan:loan_schedule(*)')
      .or(`month_year.eq.${monthYear},and(month_year.lt.${monthYear},status.in.("pending","overdue","partial"))`);

    if (filters.categoryId && filters.categoryId !== 'all') {
      query = query.eq('category_id', filters.categoryId);
    }
    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters.search) {
      query = query.or(`title.ilike.%${filters.search}%,vendor_name.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;
    if (!error && data) return data;
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
  if (filters.search) {
    const term = filters.search.toLowerCase();
    results = results.filter(
      (p) =>
        p.title.toLowerCase().includes(term) ||
        (p.vendor_name && p.vendor_name.toLowerCase().includes(term))
    );
  }

  // Attach full category objects for display
  return results.map(p => ({
    ...p,
    category: db.categories.find(c => c.id === p.category_id),
    pdc: db.pdcs.find(pdc => pdc.payable_id === p.id),
    loan: db.loan_schedule.find(l => l.payable_id === p.id)
  })) as Payable[];
}

export async function getPayableById(id: string): Promise<Payable | null> {
  if (!useMock()) {
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase
      .from('payables')
      .select('*, pdc:pdcs(*), loan:loan_schedule(*)')
      .eq('id', id)
      .single();
    if (!error && data) return data;
  }

  const db = getMockDb();
  const payable = db.payables.find((p) => p.id === id);
  if (!payable) return null;

  return {
    ...payable,
    category: db.categories.find(c => c.id === payable.category_id),
    pdc: db.pdcs.find(pdc => pdc.payable_id === payable.id),
    loan: db.loan_schedule.find(l => l.payable_id === payable.id)
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

  if (!useMock()) {
    const supabase = createBrowserSupabase();
    
    // Extract base payables mapping (omit relations: pdc, loan, category)
    const dbPayables = payablesToCreate.map(({ pdc, loan, category, ...rest }) => rest);
    
    const { error: payablesError } = await supabase.from('payables').insert(dbPayables);
    if (payablesError) {
      console.error('Error inserting payables into Supabase:', payablesError);
      throw payablesError;
    }

    // Insert associated PDCs if they exist
    const pdcsToCreate = payablesToCreate
      .filter((p) => p.pdc)
      .map((p) => p.pdc!);
    
    if (pdcsToCreate.length > 0) {
      const { error: pdcsError } = await supabase.from('pdcs').insert(pdcsToCreate);
      if (pdcsError) {
        console.error('Error inserting PDCs into Supabase:', pdcsError);
        throw pdcsError;
      }
    }

    // Insert associated Loan schedules if they exist
    const loansToCreate = payablesToCreate
      .filter((p) => p.loan)
      .map((p) => p.loan!);
    
    if (loansToCreate.length > 0) {
      const { error: loansError } = await supabase.from('loan_schedule').insert(loansToCreate);
      if (loansError) {
        console.error('Error inserting loan schedule into Supabase:', loansError);
        throw loansError;
      }
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
  if (index === -1) throw new Error('Payable not found');

  const now = new Date().toISOString();
  const original = db.payables[index];

  const updatedPayable: Payable = {
    ...original,
    ...updatedFields,
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

  if (!useMock()) {
    const supabase = createBrowserSupabase();
    
    // Extract base payable fields (excluding relations: pdc, loan, category)
    const { pdc: pdcUpdate, loan: loanUpdate, category, ...payableFields } = updatedFields;
    
    if (Object.keys(payableFields).length > 0) {
      const { error: payableError } = await supabase
        .from('payables')
        .update({ ...payableFields, updated_at: now })
        .eq('id', id);
      if (payableError) {
        console.error('Error updating payable in Supabase:', payableError);
        throw payableError;
      }
    }

    if (pdcUpdate) {
      const finalPdc = updatedPayable.pdc!;
      const { error: pdcError } = await supabase
        .from('pdcs')
        .upsert(finalPdc);
      if (pdcError) {
        console.error('Error updating/upserting PDC in Supabase:', pdcError);
        throw pdcError;
      }
    } else if (pdcUpdate === null) {
      const { error: pdcDeleteError } = await supabase
        .from('pdcs')
        .delete()
        .eq('payable_id', id);
      if (pdcDeleteError) {
        console.error('Error deleting PDC in Supabase:', pdcDeleteError);
        throw pdcDeleteError;
      }
    }

    if (loanUpdate) {
      const finalLoan = updatedPayable.loan!;
      const { error: loanError } = await supabase
        .from('loan_schedule')
        .upsert(finalLoan);
      if (loanError) {
        console.error('Error updating/upserting loan schedule in Supabase:', loanError);
        throw loanError;
      }
    } else if (loanUpdate === null) {
      const { error: loanDeleteError } = await supabase
        .from('loan_schedule')
        .delete()
        .eq('payable_id', id);
      if (loanDeleteError) {
        console.error('Error deleting loan schedule in Supabase:', loanDeleteError);
        throw loanDeleteError;
      }
    }
  }

  db.payables[index] = updatedPayable;
  saveMockPayables(db.payables);

  return updatedPayable;
}

export async function deletePayable(id: string): Promise<boolean> {
  if (!useMock()) {
    const supabase = createBrowserSupabase();
    const { error } = await supabase.from('payables').delete().eq('id', id);
    if (error) {
      console.error('Error deleting payable from Supabase:', error);
      throw error;
    }
  }
  const db = getMockDb();
  const countBefore = db.payables.length;
  const filtered = db.payables.filter((p) => p.id !== id);
  saveMockPayables(filtered);
  return filtered.length < countBefore;
}

export async function updatePayableStatus(
  id: string,
  status: Payable['status'],
  paymentDate: string | null = null,
  paidAmount: number | null = null
): Promise<Payable> {
  const payable = await getPayableById(id);
  const amt = payable?.amount || 0;
  return updatePayable(id, {
    status,
    payment_date: (status === 'paid' || status === 'partial') ? (paymentDate || format(new Date(), 'yyyy-MM-dd')) : null,
    paid_amount: status === 'paid' ? amt : (status === 'partial' ? paidAmount : null)
  });
}

export async function getPdcs(filters: { status?: string } = {}): Promise<Payable[]> {
  const db = getMockDb();
  let payablesWithPdc = db.payables.filter((p) => p.category_id === 'cat-4' || p.pdc);

  // Parse filters
  if (filters.status && filters.status !== 'all') {
    payablesWithPdc = payablesWithPdc.filter((p) => p.pdc?.status === filters.status);
  }

  return payablesWithPdc.map(p => ({
    ...p,
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

export async function getReports(startMonth: string, endMonth: string): Promise<Payable[]> {
  const db = getMockDb();
  
  // Filter payables that fall within month range inclusive
  const results = db.payables.filter((p) => {
    return p.month_year >= startMonth && p.month_year <= endMonth;
  });

  return results.map(p => ({
    ...p,
    category: db.categories.find(c => c.id === p.category_id),
    pdc: db.pdcs.find(pdc => pdc.payable_id === p.id),
    loan: db.loan_schedule.find(l => l.payable_id === p.id)
  })) as Payable[];
}

export async function getAllPayables(): Promise<Payable[]> {
  if (!useMock()) {
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase
      .from('payables')
      .select('*, category:categories(*), pdc:pdcs(*), loan:loan_schedule(*)');
    if (!error && data) return data;
  }
  const db = getMockDb();
  return db.payables.map(p => ({
    ...p,
    category: db.categories.find(c => c.id === p.category_id),
    pdc: db.pdcs.find(pdc => pdc.payable_id === p.id),
    loan: db.loan_schedule.find(l => l.payable_id === p.id)
  })) as Payable[];
}

export async function getVendors(): Promise<Vendor[]> {
  if (!useMock()) {
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase.from('vendors').select('*').order('name');
    if (!error && data) return data;
  }
  return getMockDb().vendors.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createVendor(vendorData: Omit<Vendor, 'id'>): Promise<Vendor> {
  const newId = typeof crypto !== 'undefined' ? crypto.randomUUID() : 'v-' + Math.random().toString(36).substr(2, 9);
  const newVendor: Vendor = {
    ...vendorData,
    id: newId,
    created_at: new Date().toISOString()
  };
  
  if (!useMock()) {
    const supabase = createBrowserSupabase();
    await supabase.from('vendors').insert(newVendor);
  }
  
  const db = getMockDb();
  const updatedList = [...db.vendors, newVendor];
  saveMockVendors(updatedList);
  return newVendor;
}

export async function getEmployees(): Promise<Employee[]> {
  if (!useMock()) {
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
  
  if (!useMock()) {
    const supabase = createBrowserSupabase();
    await supabase.from('employees').insert(newEmployee);
  }
  
  const db = getMockDb();
  const updatedList = [...db.employees, newEmployee];
  saveMockEmployees(updatedList);
  return newEmployee;
}

