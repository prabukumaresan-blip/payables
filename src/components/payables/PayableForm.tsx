'use client';

import React, { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as zod from 'zod';
import { Payable, Category, PDC, LoanSchedule, Vendor, Employee } from '@/lib/supabase/mockDb';
import { createPayable, updatePayable, getVendors, createVendor, getEmployees, createEmployee } from '@/lib/supabase/queries';
import { AlertCircle, HelpCircle, Plus, Check } from 'lucide-react';

const formSchema = zod.object({
  title: zod.string().min(1, 'Title is required'),
  category_id: zod.string().min(1, 'Category is required'),
  vendor_name: zod.string().optional(),
  amount: zod.coerce.number().positive('Amount must be positive'),
  currency: zod.string().default('OMR'),
  due_date: zod.string().optional(),
  recurrence: zod.enum(['once', 'monthly', 'quarterly', 'annual']).default('once'),
  reference_no: zod.string().optional(),
  bank_account: zod.string().optional(),
  notes: zod.string().optional(),
  attachment_url: zod.string().optional(),
  // PDC Fields
  cheque_no: zod.string().optional(),
  bank_name: zod.string().optional(),
  cheque_date: zod.string().optional(),
  pdc_status: zod.enum(['pending', 'presented', 'cleared', 'bounced']).default('pending').optional(),
  // Loan Fields
  installment_no: zod.coerce.number().optional(),
  principal: zod.coerce.number().optional(),
  interest: zod.coerce.number().optional(),
  balance_after: zod.coerce.number().optional(),
  // Rent Fields
  rent_start_month: zod.string().optional(),
  rent_repeat_sequence: zod.enum(['monthly', 'weekly', 'quarterly']).optional(),
  rent_due_day: zod.coerce.number().optional(),
  // PDC Generator Fields
  pdc_start_date: zod.string().optional(),
  pdc_no_of_cheques: zod.coerce.number().optional(),
  pdc_reminder_days: zod.coerce.number().optional(),
});

type FormValues = zod.infer<typeof formSchema>;

interface PayableFormProps {
  categories: Category[];
  payable?: Payable | null; // Pass if editing
  onSuccess: () => void;
  onCancel: () => void;
}

export default function PayableForm({ categories, payable, onSuccess, onCancel }: PayableFormProps) {
  const isEdit = !!payable;

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting }
  } = useForm<any>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      category_id: categories[0]?.id || '',
      vendor_name: '',
      amount: 0,
      currency: 'OMR',
      due_date: new Date().toISOString().split('T')[0],
      recurrence: 'once',
      reference_no: '',
      bank_account: '',
      notes: '',
      attachment_url: '',
      cheque_no: '',
      bank_name: '',
      cheque_date: new Date().toISOString().split('T')[0],
      pdc_status: 'pending',
      installment_no: 1,
      principal: 0,
      interest: 0,
      balance_after: 0,
      rent_start_month: new Date().toISOString().split('T')[0].substring(0, 7),
      rent_repeat_sequence: 'monthly',
      rent_due_day: 5,
      pdc_start_date: new Date().toISOString().split('T')[0],
      pdc_no_of_cheques: 1,
      pdc_reminder_days: 3,
    }
  });

  // Watch category selection
  const selectedCategoryId = useWatch({ control, name: 'category_id' });
  const selectedCategory = categories.find(c => c.id === selectedCategoryId);
  const selectedRecurrence = useWatch({ control, name: 'recurrence' });

  // Vendors state
  const [vendors, setVendors] = React.useState<Vendor[]>([]);
  const [showAddVendor, setShowAddVendor] = React.useState(false);
  const [newVendorName, setNewVendorName] = React.useState('');
  const [newVendorBankName, setNewVendorBankName] = React.useState('');
  const [newVendorAccountNo, setNewVendorAccountNo] = React.useState('');
  const [newVendorEmail, setNewVendorEmail] = React.useState('');

  // Watch selected vendor
  const selectedVendorName = useWatch({ control, name: 'vendor_name' });

  // Employees state
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [showAddEmployee, setShowAddEmployee] = React.useState(false);
  const [newEmployeeName, setNewEmployeeName] = React.useState('');
  const [newEmployeeDept, setNewEmployeeDept] = React.useState('');
  const [newEmployeeEmail, setNewEmployeeEmail] = React.useState('');

  // Fetch vendors on mount
  useEffect(() => {
    async function loadVendors() {
      const list = await getVendors();
      setVendors(list);
    }
    loadVendors();
  }, []);

  // Fetch employees on mount
  useEffect(() => {
    async function loadEmployees() {
      const list = await getEmployees();
      setEmployees(list);
    }
    loadEmployees();
  }, []);

  // Auto-populate bank account when vendor changes
  useEffect(() => {
    if (selectedVendorName) {
      const found = vendors.find(v => v.name === selectedVendorName);
      if (found && found.bank_account) {
        setValue('bank_account', found.bank_account);
      }
    }
  }, [selectedVendorName, vendors, setValue]);

  // If editing, populate form defaults
  useEffect(() => {
    if (payable) {
      setValue('title', payable.title);
      setValue('category_id', payable.category_id);
      setValue('vendor_name', payable.vendor_name || '');
      setValue('amount', payable.amount);
      setValue('currency', payable.currency);
      setValue('due_date', payable.due_date);
      setValue('recurrence', payable.recurrence);
      setValue('reference_no', payable.reference_no || '');
      setValue('bank_account', payable.bank_account || '');
      setValue('notes', payable.notes || '');
      setValue('attachment_url', payable.attachment_url || '');

      if (payable.pdc) {
        setValue('cheque_no', payable.pdc.cheque_no);
        setValue('bank_name', payable.pdc.bank_name || '');
        setValue('cheque_date', payable.pdc.cheque_date);
        setValue('pdc_status', payable.pdc.status);
      }
      if (payable.loan) {
        setValue('installment_no', payable.loan.installment_no);
        setValue('principal', payable.loan.principal);
        setValue('interest', payable.loan.interest);
        setValue('balance_after', payable.loan.balance_after);
      }
      if (payable.rent_start_month) {
        setValue('rent_start_month', payable.rent_start_month);
        setValue('rent_repeat_sequence', payable.rent_repeat_sequence || 'monthly');
        setValue('rent_due_day', payable.rent_due_day || 5);
      }
    }
  }, [payable, setValue]);

  const onSubmit = async (values: any) => {
    try {
      const finalPayableData: any = {
        title: values.title,
        category_id: values.category_id,
        vendor_name: values.vendor_name || null,
        amount: values.amount,
        currency: values.currency,
        reference_no: values.reference_no || null,
        bank_account: values.bank_account || null,
        notes: values.notes || null,
        attachment_url: values.attachment_url || null,
        status: isEdit ? payable.status : 'pending',
      };

      if (selectedCategory?.name === 'Rent') {
        const startMonth = values.rent_start_month || new Date().toISOString().split('T')[0].substring(0, 7);
        const dueDay = values.rent_due_day || 5;
        
        finalPayableData.rent_start_month = startMonth;
        finalPayableData.rent_repeat_sequence = values.rent_repeat_sequence || 'monthly';
        finalPayableData.rent_due_day = dueDay;
        finalPayableData.pdc_no_of_cheques = values.pdc_no_of_cheques || 1;
        
        // Populate base due_date for compatibility
        finalPayableData.due_date = `${startMonth}-${String(dueDay).padStart(2, '0')}`;
        finalPayableData.month_year = startMonth;
        finalPayableData.recurrence = 'once'; // Handled by rent generator
      } else if (selectedCategory?.name === 'PDC') {
        const startDate = values.pdc_start_date || new Date().toISOString().split('T')[0];
        finalPayableData.pdc_start_date = startDate;
        finalPayableData.pdc_no_of_cheques = values.pdc_no_of_cheques || 1;
        
        finalPayableData.due_date = startDate;
        finalPayableData.month_year = startDate.substring(0, 7);
        finalPayableData.recurrence = 'once'; // Handled by custom sequence generator
        
        finalPayableData.pdc = {
          cheque_no: values.cheque_no || '',
          bank_name: values.bank_name || null,
          cheque_date: startDate,
          status: values.pdc_status || 'pending',
          reminder_days: values.pdc_reminder_days || 3
        };
      } else {
        finalPayableData.due_date = values.due_date || new Date().toISOString().split('T')[0];
        finalPayableData.month_year = finalPayableData.due_date.substring(0, 7);
        finalPayableData.recurrence = values.recurrence || 'once';
      }

      // Handle Loan category fields
      if (selectedCategory?.name === 'Loan') {
        finalPayableData.loan = {
          installment_no: values.installment_no || 1,
          principal: values.principal || 0,
          interest: values.interest || 0,
          balance_after: values.balance_after || 0,
        };
      }

      if (isEdit && payable) {
        await updatePayable(payable.id, finalPayableData);
      } else {
        await createPayable(finalPayableData);
      }

      onSuccess();
    } catch (e) {
      console.error('Error submitting form:', e);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 text-slate-700">
      {/* Title */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Title <span className="text-rose-500">*</span>
        </label>
        <input
          {...register('title')}
          placeholder="e.g. Office Rent, IT Consultancy"
          className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-850 outline-none focus:border-indigo-500"
        />
        {errors.title && (
          <p className="text-xs text-rose-500 flex items-center gap-1 mt-1">
            <AlertCircle className="h-3 w-3" /> {String(errors.title.message || '')}
          </p>
        )}
      </div>

      {/* Row: Category & Amount */}
      <div className="grid grid-cols-2 gap-4">
        {/* Category */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Category <span className="text-rose-500">*</span>
          </label>
          <select
            {...register('category_id')}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-800 outline-none focus:border-indigo-500"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Amount */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Amount (OMR) <span className="text-rose-500">*</span>
          </label>
          <input
            type="number"
            step="0.001"
            {...register('amount')}
            placeholder="0.000"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-850 outline-none focus:border-indigo-500 font-numeric"
          />
          {errors.amount && (
            <p className="text-xs text-rose-500 flex items-center gap-1 mt-1">
              <AlertCircle className="h-3 w-3" /> {String(errors.amount.message || '')}
            </p>
          )}
        </div>
      </div>

      {/* Row: Vendor Name & Due Date (Conditioned for non-Rent) */}
      <div className="grid grid-cols-2 gap-4">
        {/* Vendor / Employee */}
        <div className="space-y-1.5 relative">
          <div className="flex justify-between items-center">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {selectedCategory?.name === 'Petty Cash' ? 'Employee Name' : selectedCategory?.name === 'Tax' ? 'TAX Name' : selectedCategory?.name === 'Loan' ? 'Loan Name' : 'Vendor / Payee'}
            </label>
            {selectedCategory?.name === 'Petty Cash' ? (
              <button
                type="button"
                onClick={() => setShowAddEmployee(!showAddEmployee)}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 flex items-center gap-0.5"
              >
                <Plus className="h-3 w-3" />
                {showAddEmployee ? 'Select Existing' : 'New Employee'}
              </button>
            ) : (selectedCategory?.name === 'Tax' || selectedCategory?.name === 'Loan') ? null : (
              <button
                type="button"
                onClick={() => setShowAddVendor(!showAddVendor)}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 flex items-center gap-0.5"
              >
                <Plus className="h-3 w-3" />
                {showAddVendor ? 'Select Existing' : 'New Vendor'}
              </button>
            )}
          </div>
          
          {selectedCategory?.name === 'Petty Cash' ? (
            showAddEmployee ? (
              <div className="rounded-lg border border-indigo-100 bg-indigo-50/30 p-3 space-y-3">
                <div className="space-y-1">
                  <input
                    type="text"
                    placeholder="New Employee Name *"
                    value={newEmployeeName}
                    onChange={(e) => setNewEmployeeName(e.target.value)}
                    className="w-full rounded border border-slate-200 bg-white py-1.5 px-2.5 text-xs text-slate-800 outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Department"
                    value={newEmployeeDept}
                    onChange={(e) => setNewEmployeeDept(e.target.value)}
                    className="w-full rounded border border-slate-200 bg-white py-1.5 px-2.5 text-xs text-slate-800 outline-none focus:border-indigo-500"
                  />
                  <input
                    type="email"
                    placeholder="Email Address"
                    value={newEmployeeEmail}
                    onChange={(e) => setNewEmployeeEmail(e.target.value)}
                    className="w-full rounded border border-slate-200 bg-white py-1.5 px-2.5 text-xs text-slate-800 outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!newEmployeeName.trim()) return;
                    try {
                      const created = await createEmployee({
                        name: newEmployeeName.trim(),
                        department: newEmployeeDept.trim() || null,
                        email: newEmployeeEmail.trim() || null
                      });
                      setEmployees(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
                      setValue('vendor_name', created.name);
                      setShowAddEmployee(false);
                      setNewEmployeeName('');
                      setNewEmployeeDept('');
                      setNewEmployeeEmail('');
                    } catch (err) {
                      console.error('Error creating employee:', err);
                    }
                  }}
                  className="w-full rounded bg-indigo-600 py-1.5 px-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-indigo-500 flex items-center justify-center gap-1"
                >
                  <Check className="h-3 w-3" /> Save & Select Employee
                </button>
              </div>
            ) : (
              <select
                {...register('vendor_name')}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-850 outline-none focus:border-indigo-500"
              >
                <option value="">Select Employee</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.name}>
                    {emp.name} {emp.department ? `(${emp.department})` : ''}
                  </option>
                ))}
              </select>
            )
          ) : (selectedCategory?.name === 'Tax' || selectedCategory?.name === 'Loan') ? (
            <input
              type="text"
              {...register('vendor_name')}
              placeholder={selectedCategory?.name === 'Tax' ? "e.g. VAT, Corporate Tax" : "e.g. Car Loan, Business Loan"}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-850 outline-none focus:border-indigo-500"
            />
          ) : showAddVendor ? (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/30 p-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="New Vendor Name *"
                  value={newVendorName}
                  onChange={(e) => setNewVendorName(e.target.value)}
                  className="w-full rounded border border-slate-200 bg-white py-1.5 px-2.5 text-xs text-slate-800 outline-none focus:border-indigo-500"
                />
                <input
                  type="email"
                  placeholder="Email Address"
                  value={newVendorEmail}
                  onChange={(e) => setNewVendorEmail(e.target.value)}
                  className="w-full rounded border border-slate-200 bg-white py-1.5 px-2.5 text-xs text-slate-800 outline-none focus:border-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Bank Name (e.g. Bank Muscat)"
                  value={newVendorBankName}
                  onChange={(e) => setNewVendorBankName(e.target.value)}
                  className="w-full rounded border border-slate-200 bg-white py-1.5 px-2.5 text-xs text-slate-800 outline-none focus:border-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Account No / Details"
                  value={newVendorAccountNo}
                  onChange={(e) => setNewVendorAccountNo(e.target.value)}
                  className="w-full rounded border border-slate-200 bg-white py-1.5 px-2.5 text-xs text-slate-800 outline-none focus:border-indigo-500"
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!newVendorName.trim()) return;
                  try {
                    const bName = newVendorBankName.trim();
                    const accNo = newVendorAccountNo.trim();
                    let combinedBankAcc = null;
                    if (bName && accNo) {
                      combinedBankAcc = `${bName} - ${accNo}`;
                    } else {
                      combinedBankAcc = bName || accNo || null;
                    }

                    const created = await createVendor({
                      name: newVendorName.trim(),
                      bank_name: bName || null,
                      account_no: accNo || null,
                      bank_account: combinedBankAcc,
                      email: newVendorEmail.trim() || null
                    });
                    setVendors(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
                    setValue('vendor_name', created.name);
                    if (created.bank_account) {
                      setValue('bank_account', created.bank_account);
                    }
                    setShowAddVendor(false);
                    setNewVendorName('');
                    setNewVendorBankName('');
                    setNewVendorAccountNo('');
                    setNewVendorEmail('');
                  } catch (err) {
                    console.error('Error creating vendor:', err);
                  }
                }}
                className="w-full rounded bg-indigo-600 py-1.5 px-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-indigo-500 flex items-center justify-center gap-1"
              >
                <Check className="h-3 w-3" /> Save & Select Vendor
              </button>
            </div>
          ) : (
            <select
              {...register('vendor_name')}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-850 outline-none focus:border-indigo-500"
            >
              <option value="">Select Vendor</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Due Date (only if not Rent, PDC, Petty Cash, Tax, or Loan) */}
        {selectedCategory?.name !== 'Rent' && selectedCategory?.name !== 'PDC' && selectedCategory?.name !== 'Petty Cash' && selectedCategory?.name !== 'Tax' && selectedCategory?.name !== 'Loan' ? (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Due Date <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              {...register('due_date')}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-850 outline-none focus:border-indigo-500"
            />
            {errors.due_date && (
              <p className="text-xs text-rose-500 flex items-center gap-1 mt-1">
                <AlertCircle className="h-3 w-3" /> {String(errors.due_date.message || '')}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1.5" />
        )}
      </div>

      {/* Dynamic Fields for Rent */}
      {selectedCategory?.name === 'Rent' && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-violet-750">
            Rent Schedule Details
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Starting Month & Year <span className="text-rose-500">*</span>
              </label>
              <input
                type="month"
                {...register('rent_start_month')}
                className="w-full rounded border border-slate-200 bg-white py-1.5 px-2.5 text-xs text-slate-800 outline-none focus:border-violet-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Number of Months (Dues) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                {...register('pdc_no_of_cheques')}
                className="w-full rounded border border-slate-200 bg-white py-1.5 px-2.5 text-xs text-slate-800 outline-none focus:border-violet-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Due Day of Month
              </label>
              <input
                type="number"
                min={1}
                max={31}
                {...register('rent_due_day')}
                className="w-full rounded border border-slate-200 bg-white py-1.5 px-2.5 text-xs text-slate-800 outline-none focus:border-violet-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Repeat Sequence
              </label>
              <select
                {...register('rent_repeat_sequence')}
                className="w-full rounded border border-slate-200 bg-white py-1.5 px-2.5 text-xs text-slate-800 outline-none focus:border-violet-500"
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Row: Recurrence & Bank Account */}
      <div className={(selectedCategory?.name === 'Rent' || selectedCategory?.name === 'PDC' || selectedCategory?.name === 'Petty Cash' || selectedCategory?.name === 'Tax') ? 'grid grid-cols-1' : 'grid grid-cols-2 gap-4'}>
        {/* Recurrence */}
        {selectedCategory?.name !== 'Rent' && selectedCategory?.name !== 'PDC' && selectedCategory?.name !== 'Petty Cash' && selectedCategory?.name !== 'Tax' && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              Recurrence
              <span title="Select 'Monthly' or others to auto-schedule future occurrences"><HelpCircle className="h-3 w-3 text-slate-400" /></span>
            </label>
            <select
              {...register('recurrence')}
              disabled={isEdit}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-880 outline-none focus:border-indigo-500 disabled:opacity-50"
            >
              <option value="once">Once</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>

            {/* Number of EMIs (Months) for Loan */}
            {selectedCategory?.name === 'Loan' && selectedRecurrence && selectedRecurrence !== 'once' && (
              <div className="space-y-1.5 mt-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Number of EMIs (Months)
                </label>
                <input
                  type="number"
                  min={1}
                  {...register('pdc_no_of_cheques')}
                  placeholder="e.g. 12"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-850 outline-none focus:border-indigo-500 font-numeric"
                />
              </div>
            )}
          </div>
        )}

        {/* Bank Account */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Bank Account
          </label>
          <input
            {...register('bank_account')}
            placeholder="e.g. Bank Muscat Main"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-850 outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Dynamic Fields for PDC */}
      {selectedCategory?.name === 'PDC' && (
        <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4 space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-orange-700">
            Post-Dated Cheque (PDC) Schedule Details
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Starting Cheque Number <span className="text-rose-500">*</span>
              </label>
              <input
                {...register('cheque_no')}
                placeholder="e.g. CHQ-1001"
                className="w-full rounded border border-slate-200 bg-white py-1.5 px-2.5 text-xs text-slate-800 outline-none focus:border-orange-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Starting Cheque Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                {...register('pdc_start_date')}
                className="w-full rounded border border-slate-200 bg-white py-1.5 px-2.5 text-xs text-slate-800 outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Number of Cheques / Dues <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                {...register('pdc_no_of_cheques')}
                className="w-full rounded border border-slate-200 bg-white py-1.5 px-2.5 text-xs text-slate-800 outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Bank Name
              </label>
              <input
                {...register('bank_name')}
                placeholder="e.g. Sohar International"
                className="w-full rounded border border-slate-200 bg-white py-1.5 px-2.5 text-xs text-slate-800 outline-none focus:border-orange-500"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Reminder (Days Before Cheque Date)
                </label>
                <span title="Set how many days before the cheque date you want to be alerted on the dashboard"><HelpCircle className="h-3 w-3 text-slate-400" /></span>
              </div>
              <input
                type="number"
                min={0}
                {...register('pdc_reminder_days')}
                className="w-full rounded border border-slate-200 bg-white py-1.5 px-2.5 text-xs text-slate-800 outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Cheque Status
              </label>
              <select
                {...register('pdc_status')}
                className="w-full rounded border border-slate-200 bg-white py-1.5 px-2.5 text-xs text-slate-800 outline-none focus:border-orange-500"
              >
                <option value="pending">Pending</option>
                <option value="presented">Presented</option>
                <option value="cleared">Cleared</option>
                <option value="bounced">Bounced</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Row: Reference No & Attachment */}
      <div className={(selectedCategory?.name === 'Petty Cash' || selectedCategory?.name === 'Tax' || selectedCategory?.name === 'Loan') ? 'grid grid-cols-1' : 'grid grid-cols-2 gap-4'}>
        {/* Reference No */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Reference No / Invoice #
          </label>
          <input
            {...register('reference_no')}
            placeholder="e.g. INV-900821"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-850 outline-none focus:border-indigo-500"
          />
        </div>

        {/* Attachment Mock */}
        {selectedCategory?.name !== 'Petty Cash' && selectedCategory?.name !== 'Tax' && selectedCategory?.name !== 'Loan' && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Attachment URL
            </label>
            <input
              {...register('attachment_url')}
              placeholder="e.g. invoice.pdf"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-850 outline-none focus:border-indigo-500"
            />
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Notes
        </label>
        <textarea
          {...register('notes')}
          rows={3}
          placeholder="Additional comments or descriptions..."
          className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-850 outline-none focus:border-indigo-500"
        />
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-indigo-500"
        >
          {isSubmitting ? 'Saving...' : 'Save Payable'}
        </button>
      </div>
    </form>
  );
}
