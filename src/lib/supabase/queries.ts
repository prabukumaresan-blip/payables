import { isSupabaseConfigured, createClient as createBrowserSupabase } from './client';
import { getMockDb, saveMockPayables, saveMockVendors, saveMockEmployees, saveMockPaymentHistory, saveMockLandowners, SEEDED_CATEGORIES, Payable, PDC, Category, LoanSchedule, Vendor, Employee, Landowner, PaymentHistory } from './mockDb';
import { format, parse, addMonths, compareAsc, addWeeks, endOfMonth } from 'date-fns';

// Helper to determine if we should use mock database
const shouldUseMock = () => {
  return !isSupabaseConfigured();
};

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
  filters: { categoryId?: string; status?: string; search?: string } = {}
): Promise<Payable[]> {
  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    // Fetch items for the current month OR previous items that are unpaid (pending or overdue)
    let query = supabase
      .from('payables')
      .select('*, category:categories(*), pdc:pdcs(*), loan:loan_schedule(*)')
      .or(`month_year.eq.${monthYear},and(month_year.lt.${monthYear},status.in.(pending,overdue,partial))`);

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
  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase
      .from('payables')
      .select('*, pdc:pdcs(*), loan:loan_schedule(*), payments:payment_history(*)')
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
    
    // Extract base payables mapping (omit relations: pdc, loan, category)
    const dbPayables = payablesToCreate.map(({ pdc, loan, category: _category, ...rest }) => rest);
    
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
    
    // Extract base payable fields (excluding relations: pdc, loan, category)
    const { pdc: pdcUpdate, loan: loanUpdate, category: _category, ...payableFields } = fieldsToUpdate;
    
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

export async function getPdcs(filters: { status?: string } = {}): Promise<Payable[]> {
  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase
      .from('payables')
      .select('*, category:categories(*), pdc:pdcs(*)');
      
    if (!error && data) {
      // Filter in JS to find payables with PDC
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let results = (data as any[]).filter(p => p.category_id === 'cat-4' || p.pdc);
      
      if (filters.status && filters.status !== 'all') {
        results = results.filter(p => p.pdc?.status === filters.status);
      }
      
      return results as Payable[];
    }
  }

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
  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase
      .from('payables')
      .select('*, category:categories(*), pdc:pdcs(*), loan:loan_schedule(*)')
      .or(`and(month_year.gte.${startMonth},month_year.lte.${endMonth}),and(month_year.lt.${startMonth},status.in.(pending,overdue,partial))`);
    if (!error && data) return data;
  }

  const db = getMockDb();
  
  // Filter payables that fall within month range inclusive or previous unpaid items
  const results = db.payables.filter((p) => {
    const inRange = p.month_year >= startMonth && p.month_year <= endMonth;
    const isPreviousUnpaid = p.month_year < startMonth && (p.status === 'pending' || p.status === 'overdue' || p.status === 'partial');
    return inRange || isPreviousUnpaid;
  });

  return results.map(p => ({
    ...p,
    category: db.categories.find(c => c.id === p.category_id),
    pdc: db.pdcs.find(pdc => pdc.payable_id === p.id),
    loan: db.loan_schedule.find(l => l.payable_id === p.id)
  })) as Payable[];
}

export async function getAllPayables(): Promise<Payable[]> {
  if (!shouldUseMock()) {
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
  if (!shouldUseMock()) {
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
    const supabase = createBrowserSupabase();
    const { error } = await supabase
      .from('vendors')
      .update(vendorData)
      .eq('id', id);
    if (error) {
      console.error('Error updating vendor in Supabase:', error);
      throw error;
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
    if (!error && data) return data;
  }
  const db = getMockDb();
  return (db.payment_history || [])
    .filter((ph) => ph.payable_id === payableId)
    .sort((a, b) => b.payment_date.localeCompare(a.payment_date));
}

export async function addPaymentRecord(
  payment: Omit<PaymentHistory, 'id' | 'created_at'>
): Promise<Payable> {
  const newId = typeof crypto !== 'undefined' ? crypto.randomUUID() : 'pay-' + Math.random().toString(36).substr(2, 9);
  const now = new Date().toISOString();
  const newPayment: PaymentHistory = {
    ...payment,
    id: newId,
    created_at: now
  };

  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    const { error: insertError } = await supabase
      .from('payment_history')
      .insert(newPayment);
    if (insertError) {
      console.error('Error inserting payment record:', insertError);
      throw insertError;
    }
  } else {
    const db = getMockDb();
    const historyList = [...(db.payment_history || []), newPayment];
    saveMockPaymentHistory(historyList);
  }

  return recalculatePayableStatusAndPaidAmount(payment.payable_id);
}

export async function deletePaymentRecord(paymentId: string, payableId: string): Promise<Payable> {
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

  return recalculatePayableStatusAndPaidAmount(payableId);
}

async function createRawPaymentRecord(payment: {
  payable_id: string;
  amount: number;
  payment_date: string;
  reference_no?: string | null;
  bank_account?: string | null;
  notes?: string | null;
}): Promise<PaymentHistory> {
  const newId = typeof crypto !== 'undefined' ? crypto.randomUUID() : 'pay-' + Math.random().toString(36).substr(2, 9);
  const now = new Date().toISOString();
  const newPayment: PaymentHistory = {
    ...payment,
    id: newId,
    created_at: now
  };

  if (!shouldUseMock()) {
    const supabase = createBrowserSupabase();
    const { error } = await supabase.from('payment_history').insert(newPayment);
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
      await createRawPaymentRecord({
        payable_id: payableId,
        amount: diff,
        payment_date: pDate,
        notes: 'Full payment status update'
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
        await createRawPaymentRecord({
          payable_id: payableId,
          amount: newPaidAmount,
          payment_date: pDate,
          notes: 'Status update sync'
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

