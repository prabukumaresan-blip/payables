'use client';

import React, { useEffect, useState, Suspense } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { 
  getEmployees, 
  createEmployee, 
  updateEmployee, 
  deleteEmployee, 
  getAllPayables 
} from '@/lib/supabase/queries';
import { Employee, Payable } from '@/lib/supabase/mockDb';
import { cn } from '@/lib/utils';
import { 
  Users, 
  Search, 
  Plus, 
  Edit3, 
  Trash2, 
  X, 
  Check, 
  Loader2, 
  AlertTriangle,
  Mail,
  Phone,
  Briefcase,
  Landmark,
  CreditCard,
  Upload,
  CheckCircle2
} from 'lucide-react';
import { parseEmployeeImportFile, ParsedEmployeeRow } from '@/lib/utils/fileUtils';

function EmployeesContent() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Form Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [swiftCode, setSwiftCode] = useState('');
  const [bankType, setBankType] = useState<'BANK_MUSCAT' | 'OTHER_BANK'>('BANK_MUSCAT');

  // Delete State
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedEmployeeRow[]>([]);
  const [rowActions, setRowActions] = useState<Record<number, 'import' | 'update' | 'skip'>>({});
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [importLoading, setImportLoading] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importSummary, setImportSummary] = useState<{ imported: number; updated: number; skipped: number } | null>(null);

  // Handle file import parsing and validation
  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setImportLoading(true);
    setImportSummary(null);
    setImportProgress(null);

    try {
      const rows = await parseEmployeeImportFile(file);
      
      const initialActions: Record<number, 'import' | 'update' | 'skip'> = {};
      const errors: Record<number, string> = {};

      rows.forEach((row) => {
        if (!row.name || !row.name.trim()) {
          errors[row.rowIndex] = 'Employee Name is required';
          initialActions[row.rowIndex] = 'skip';
          return;
        }

        if (row.bank_type === 'OTHER_BANK' && (!row.swift_code || !row.swift_code.trim())) {
          errors[row.rowIndex] = 'SWIFT Code is required for OTHER BANK employees';
          initialActions[row.rowIndex] = 'skip';
          return;
        }

        // Check duplicates against current list of employees
        const match = employees.find(emp => emp.name.toLowerCase().trim() === row.name.toLowerCase().trim());
        if (match) {
          const isIdentical = 
            (match.bank_type === row.bank_type) &&
            ((match.department || '') === (row.department || '')) &&
            ((match.email || '') === (row.email || '')) &&
            ((match.phone || '') === (row.phone || '')) &&
            ((match.bank_name || '') === (row.bank_name || '')) &&
            ((match.account_no || '') === (row.account_no || '')) &&
            ((match.swift_code || '') === (row.swift_code || ''));

          if (isIdentical) {
            initialActions[row.rowIndex] = 'skip';
          } else {
            initialActions[row.rowIndex] = 'update';
          }
        } else {
          initialActions[row.rowIndex] = 'import';
        }
      });

      setParsedRows(rows);
      setRowActions(initialActions);
      setRowErrors(errors);
    } catch (err: any) {
      console.error(err);
      alert('Error parsing Excel file. Please ensure it is a valid format.');
      setImportFile(null);
    } finally {
      setImportLoading(false);
    }
  };

  // Run the batch import
  const handleExecuteImport = async () => {
    setImportLoading(true);
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    const toProcess = parsedRows.filter(
      row => rowActions[row.rowIndex] === 'import' || rowActions[row.rowIndex] === 'update'
    );

    setImportProgress({ current: 0, total: toProcess.length });

    try {
      let currentProgress = 0;

      for (const row of parsedRows) {
        const action = rowActions[row.rowIndex];
        
        if (action === 'skip') {
          skippedCount++;
          continue;
        }

        const bName = (row.bank_name || '').trim();
        const accNo = (row.account_no || '').trim();
        let combinedBankAcc = null;
        if (bName && accNo) {
          combinedBankAcc = `${bName} - ${accNo}`;
        } else {
          combinedBankAcc = bName || accNo || null;
        }

        const employeeData = {
          name: row.name.trim(),
          department: row.department ? row.department.trim() : null,
          email: row.email ? row.email.trim() : null,
          phone: row.phone ? row.phone.trim() : null,
          bank_name: bName || null,
          account_no: accNo || null,
          swift_code: row.swift_code ? row.swift_code.trim() : null,
          bank_type: row.bank_type,
          bank_account: combinedBankAcc
        };

        if (action === 'update') {
          const existing = employees.find(emp => emp.name.toLowerCase().trim() === row.name.toLowerCase().trim());
          if (existing) {
            await updateEmployee(existing.id, employeeData);
            updatedCount++;
          } else {
            await createEmployee(employeeData);
            importedCount++;
          }
        } else if (action === 'import') {
          await createEmployee(employeeData);
          importedCount++;
        }

        currentProgress++;
        setImportProgress({ current: currentProgress, total: toProcess.length });
      }

      setImportSummary({
        imported: importedCount,
        updated: updatedCount,
        skipped: skippedCount
      });

      await loadData();
    } catch (err: any) {
      console.error('Error importing employees:', err);
      alert('An error occurred during import. Some employees may have been imported.');
    } finally {
      setImportLoading(false);
      setImportProgress(null);
    }
  };

  const handleCloseImportModal = () => {
    setIsImportModalOpen(false);
    setImportFile(null);
    setParsedRows([]);
    setRowActions({});
    setRowErrors({});
    setImportSummary(null);
    setImportProgress(null);
  };

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const empList = await getEmployees();
      const pList = await getAllPayables();
      setEmployees(empList);
      setPayables(pList);
    } catch (e) {
      console.error('Error loading employees data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered employees
  const filteredEmployees = employees.filter(emp => {
    const query = searchQuery.toLowerCase();
    return (
      emp.name.toLowerCase().includes(query) ||
      (emp.department && emp.department.toLowerCase().includes(query)) ||
      (emp.email && emp.email.toLowerCase().includes(query)) ||
      (emp.bank_name && emp.bank_name.toLowerCase().includes(query)) ||
      (emp.account_no && emp.account_no.toLowerCase().includes(query))
    );
  });

  // Calculate stats
  const totalEmployees = employees.length;
  const employeesWithBank = employees.filter(emp => emp.account_no && emp.bank_name).length;
  
  // Active employees are those whose names appear in "Petty Cash" category payables this month
  const currentMonthStart = new Date();
  currentMonthStart.setDate(1);
  currentMonthStart.setHours(0, 0, 0, 0);

  const activeEmployeeNames = new Set(
    payables
      .filter(p => {
        // filter for Petty Cash and current month payables
        if (!p.vendor_name || !p.created_at) return false;
        
        // Match by category
        // The category name for petty cash in seed is "Petty Cash"
        const isPettyCash = p.category?.name === 'Petty Cash';
        const payableDate = new Date(p.created_at);
        return isPettyCash && payableDate >= currentMonthStart;
      })
      .map(p => p.vendor_name)
      .filter(Boolean)
  );
  
  const activeEmployeesCount = employees.filter(emp => activeEmployeeNames.has(emp.name)).length;

  // Open modal for Create/Edit
  const handleOpenModal = (employee: Employee | null = null) => {
    setFormError(null);
    if (employee) {
      setEditingEmployee(employee);
      setName(employee.name);
      setDepartment(employee.department || '');
      setEmail(employee.email || '');
      setPhone(employee.phone || '');
      setBankName(employee.bank_name || '');
      setAccountNo(employee.account_no || '');
      setSwiftCode(employee.swift_code || '');
      setBankType(employee.bank_type || 'BANK_MUSCAT');
    } else {
      setEditingEmployee(null);
      setName('');
      setDepartment('');
      setEmail('');
      setPhone('');
      setBankName('');
      setAccountNo('');
      setSwiftCode('');
      setBankType('BANK_MUSCAT');
    }
    setIsModalOpen(true);
  };

  // Submit form handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Employee Name is required');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const bName = bankName.trim();
      const accNo = accountNo.trim();
      let combinedBankAcc = null;
      if (bName && accNo) {
        combinedBankAcc = `${bName} - ${accNo}`;
      } else {
        combinedBankAcc = bName || accNo || null;
      }

      const employeeData = {
        name: name.trim(),
        department: department.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        bank_name: bName || null,
        account_no: accNo || null,
        swift_code: swiftCode.trim() || null,
        bank_type: bankType,
        bank_account: combinedBankAcc
      };

      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, employeeData);
      } else {
        await createEmployee(employeeData);
      }

      await loadData();
      setIsModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setFormError('Failed to save employee details. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete employee handler
  const handleDeleteClick = (employee: Employee) => {
    setDeleteTarget(employee);
    setIsDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    setLoading(true);
    try {
      await deleteEmployee(deleteTarget.id);
      await loadData();
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
    } catch (err) {
      console.error('Error deleting employee:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout title="Employee Directory" showMonthSelector={false}>
      <div className="space-y-6">
        
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-indigo-50 border border-indigo-150 flex items-center justify-center text-indigo-650">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Employees</p>
              <p className="text-2xl font-bold text-slate-850 mt-1">{totalEmployees}</p>
            </div>
          </div>

          <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-emerald-50 border border-emerald-150 flex items-center justify-center text-emerald-650">
              <Landmark className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">With Bank Details</p>
              <p className="text-2xl font-bold text-slate-850 mt-1">{employeesWithBank}</p>
            </div>
          </div>

          <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-amber-50 border border-amber-150 flex items-center justify-center text-amber-650">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active (This Month)</p>
              <p className="text-2xl font-bold text-slate-850 mt-1">{activeEmployeesCount}</p>
            </div>
          </div>
        </div>

        {/* Filter and Actions Bar */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          {/* Search */}
          <div className="relative min-w-[280px] flex-1 md:flex-initial">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employees by name, department, bank..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
              title="Import from Excel"
            >
              <Upload className="h-4 w-4 text-slate-500" />
              <span className="hidden sm:inline">Import from Excel</span>
            </button>
            <button
              onClick={() => handleOpenModal(null)}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-500/10 hover:bg-indigo-500 transition-colors cursor-pointer"
              title="Add Employee"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Employee</span>
            </button>
          </div>
        </div>

        {/* Employees Table */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="space-y-4 p-8 animate-pulse">
              <div className="h-8 rounded bg-slate-100 w-full" />
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 rounded bg-slate-100 w-full" />
              ))}
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="py-20 text-center text-slate-400">
              <p className="text-sm">No employees found matching your search.</p>
            </div>
          ) : (
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    <th className="py-3 px-6">Employee Name</th>
                    <th className="py-3 px-6">Bank Type</th>
                    <th className="py-3 px-6">Department</th>
                    <th className="py-3 px-6">Contact Info</th>
                    <th className="py-3 px-6">Bank Name</th>
                    <th className="py-3 px-6">Account Number</th>
                    <th className="py-3 px-6">SWIFT Code</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  {filteredEmployees.map((employee) => (
                    <tr key={employee.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-6 font-semibold text-slate-900 truncate max-w-[200px]" title={employee.name}>
                        {employee.name}
                      </td>
                      <td className="py-3.5 px-6">
                        <span className={cn(
                          "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border",
                          employee.bank_type === 'OTHER_BANK' 
                            ? "bg-amber-50 text-amber-700 border-amber-200/50" 
                            : "bg-indigo-50 text-indigo-700 border-indigo-200/50"
                        )}>
                          {employee.bank_type === 'OTHER_BANK' ? 'OTHER BANK' : 'BANK MUSCAT'}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 text-slate-600">
                        {employee.department ? (
                          <span className="flex items-center gap-1.5">
                            <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                            {employee.department}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-6 text-slate-500">
                        <div className="flex flex-col gap-0.5">
                          {employee.email && (
                            <span className="flex items-center gap-1 text-xs">
                              <Mail className="h-3 w-3 text-slate-400" />
                              {employee.email}
                            </span>
                          )}
                          {employee.phone && (
                            <span className="flex items-center gap-1 text-[11px]">
                              <Phone className="h-3 w-3 text-slate-400" />
                              {employee.phone}
                            </span>
                          )}
                          {!employee.email && !employee.phone && <span className="text-slate-400">—</span>}
                        </div>
                      </td>
                      <td className="py-3.5 px-6 text-slate-700 font-medium">
                        {employee.bank_name || <span className="text-slate-400 font-normal">—</span>}
                      </td>
                      <td className="py-3.5 px-6 font-mono text-xs text-slate-800">
                        {employee.account_no || <span className="text-slate-400 font-normal font-sans">—</span>}
                      </td>
                      <td className="py-3.5 px-6 font-mono text-xs font-semibold text-slate-750">
                        {employee.swift_code || <span className="text-slate-400 font-normal font-sans">—</span>}
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenModal(employee)}
                            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-655 transition-colors"
                            title="Edit Employee"
                          >
                            <Edit3 className="h-4.5 w-4.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(employee)}
                            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 transition-colors"
                            title="Delete Employee"
                          >
                            <Trash2 className="h-4.5 w-4.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create/Edit Modal popup */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop overlay */}
            <div 
              onClick={() => { if (!submitting) setIsModalOpen(false); }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
            />

            {/* Modal Dialog Card */}
            <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden transition-all duration-200">
              
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-150 flex items-center justify-between shrink-0 bg-slate-50/50">
                <h3 className="text-md font-bold text-slate-900 font-sans">
                  {editingEmployee ? 'Edit Employee Details' : 'Add New Employee'}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Form Body */}
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                
                {formError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3.5 text-xs text-rose-600 flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
                    <p className="leading-relaxed">{formError}</p>
                  </div>
                )}

                {/* Employee Name & Bank Type */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Employee Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Salim Al Jabri"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-855 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Bank Type
                    </label>
                    <select
                      value={bankType}
                      onChange={(e) => setBankType(e.target.value as 'BANK_MUSCAT' | 'OTHER_BANK')}
                      className="w-full rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-800 outline-none focus:border-indigo-500"
                    >
                      <option value="BANK_MUSCAT">BANK MUSCAT</option>
                      <option value="OTHER_BANK">OTHER BANK</option>
                    </select>
                  </div>
                </div>

                {/* Department */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Department
                  </label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Operations, Finance, Logistics"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-855 outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Email and Phone */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. salim@company.com"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-855 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. +968 99123456"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-855 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Bank Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. Bank Muscat, Sohar International"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-850 outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Account Number and SWIFT Code */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Bank Account Number
                    </label>
                    <input
                      type="text"
                      value={accountNo}
                      onChange={(e) => setAccountNo(e.target.value)}
                      placeholder="e.g. 0371024323360013"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-855 outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Bank SWIFT Code {bankType === 'OTHER_BANK' && <span className="text-rose-500">*</span>}
                    </label>
                    <input
                      type="text"
                      value={swiftCode}
                      onChange={(e) => setSwiftCode(e.target.value)}
                      placeholder="e.g. MSCTOMRXXXX"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-855 outline-none focus:border-indigo-500 font-mono uppercase"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    disabled={submitting}
                    className="rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-lg bg-indigo-600 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-indigo-500 shadow-md shadow-indigo-500/10 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
                      </>
                    ) : (
                      'Save Employee'
                    )}
                  </button>
                </div>

              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {isDeleteModalOpen && deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
              onClick={() => setIsDeleteModalOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
            />

            <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 border border-rose-100">
                  <AlertTriangle className="h-5 w-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-sans">
                    Delete Employee
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Are you sure you want to delete employee &quot;{deleteTarget.name}&quot;? This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={executeDelete}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 shadow-md shadow-rose-500/10 transition-colors"
                >
                  Delete Employee
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Import Employees Excel Modal */}
        {isImportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop overlay */}
            <div 
              onClick={() => { if (!importLoading) handleCloseImportModal(); }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
            />

            {/* Modal Dialog Card */}
            <div className="relative w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden transition-all duration-200">
              
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-150 flex items-center justify-between shrink-0 bg-slate-50/50">
                <div>
                  <h3 className="text-md font-bold text-slate-900 font-sans">
                    Import Employees from Excel
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Upload an Excel spreadsheet with employee department and bank details.
                  </p>
                </div>
                <button
                  onClick={handleCloseImportModal}
                  disabled={importLoading}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* Step 1: Upload and Template Info */}
                {!importSummary && parsedRows.length === 0 && (
                  <div className="space-y-6">
                    <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-indigo-900">Need the import template?</h4>
                        <p className="text-xs text-indigo-700">
                          Format columns in your sheet as: Name, Bank Type (BANK_MUSCAT / OTHER_BANK), Department, Email, Phone, Bank Name, Account Number, SWIFT Code.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-12 hover:bg-slate-50/30 transition-colors relative cursor-pointer">
                      <input 
                        type="file" 
                        accept=".xlsx, .xls, .csv" 
                        onChange={handleImportFileChange}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        disabled={importLoading}
                      />
                      {importLoading ? (
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 className="h-10 w-10 text-indigo-650 animate-spin" />
                          <p className="text-sm font-medium text-slate-700">Reading Excel spreadsheet...</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <Upload className="h-10 w-10 text-slate-400" />
                          <p className="text-sm font-medium text-slate-700">Drag and drop your spreadsheet here, or browse files</p>
                          <p className="text-xs text-slate-400">Supports .xlsx, .xls, and .csv formats</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Step 2: Row Review Table */}
                {!importSummary && parsedRows.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-600">
                        Total Parsed Rows: <span className="text-slate-900">{parsedRows.length}</span>
                      </p>
                      <span className="text-[11px] text-slate-400">Review actions and resolve errors before importing.</span>
                    </div>

                    <div className="border border-slate-200 rounded-xl max-h-[350px] overflow-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-4 w-12 text-center">Row</th>
                            <th className="py-2.5 px-4">Action</th>
                            <th className="py-2.5 px-4">Name</th>
                            <th className="py-2.5 px-4">Department</th>
                            <th className="py-2.5 px-4">Bank Type</th>
                            <th className="py-2.5 px-4">Bank Name</th>
                            <th className="py-2.5 px-4">Account Number</th>
                            <th className="py-2.5 px-4">SWIFT</th>
                            <th className="py-2.5 px-4">Status / Errors</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {parsedRows.map((row) => {
                            const action = rowActions[row.rowIndex] || 'import';
                            const error = rowErrors[row.rowIndex];

                            return (
                              <tr key={row.rowIndex} className={cn("hover:bg-slate-50/50", error ? "bg-rose-50/20" : "")}>
                                <td className="py-2 px-4 text-center font-semibold text-slate-400">{row.rowIndex}</td>
                                <td className="py-2 px-4">
                                  <select
                                    value={action}
                                    onChange={(e) => {
                                      const act = e.target.value as 'import' | 'update' | 'skip';
                                      setRowActions(prev => ({ ...prev, [row.rowIndex]: act }));
                                    }}
                                    disabled={!!error}
                                    className="rounded border border-slate-200 bg-white py-1 px-1.5 text-[11px] font-medium outline-none focus:border-indigo-500"
                                  >
                                    <option value="import">Create</option>
                                    <option value="update">Update</option>
                                    <option value="skip">Skip</option>
                                  </select>
                                </td>
                                <td className="py-2 px-4 font-semibold text-slate-900">{row.name}</td>
                                <td className="py-2 px-4 text-slate-500">{row.department || '—'}</td>
                                <td className="py-2 px-4">
                                  <span className={cn(
                                    "px-1.5 py-0.5 rounded text-[9px] font-semibold border",
                                    row.bank_type === 'OTHER_BANK' ? "bg-amber-50 text-amber-700 border-amber-200/50" : "bg-indigo-50 text-indigo-700 border-indigo-200/50"
                                  )}>
                                    {row.bank_type === 'OTHER_BANK' ? 'OTHER' : 'MUSCAT'}
                                  </span>
                                </td>
                                <td className="py-2 px-4 font-medium text-slate-700">{row.bank_name || '—'}</td>
                                <td className="py-2 px-4 font-mono text-[11px] text-slate-800">{row.account_no || '—'}</td>
                                <td className="py-2 px-4 font-mono text-[11px] font-semibold text-slate-700">{row.swift_code || '—'}</td>
                                <td className="py-2 px-4">
                                  {error ? (
                                    <span className="text-rose-600 font-semibold flex items-center gap-1">
                                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                      {error}
                                    </span>
                                  ) : action === 'skip' ? (
                                    <span className="text-slate-400">Skipped</span>
                                  ) : action === 'update' ? (
                                    <span className="text-amber-600 font-medium">Updates existing record</span>
                                  ) : (
                                    <span className="text-emerald-600 font-medium">Ready</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Step 3: Success Summary */}
                {importSummary && (
                  <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
                    <div className="h-14 w-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-650 shadow-sm shadow-emerald-500/10">
                      <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <div>
                      <h4 className="text-md font-bold text-slate-900">Import Completed Successfully</h4>
                      <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                        Employee directory database has been updated with the changes from your Excel spreadsheet.
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-6 bg-slate-50 rounded-xl p-4 border border-slate-200/50 min-w-[320px] max-w-sm mt-2">
                      <div className="text-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Created</span>
                        <p className="text-xl font-bold text-slate-900 mt-0.5">{importSummary.imported}</p>
                      </div>
                      <div className="text-center border-x border-slate-200/60">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Updated</span>
                        <p className="text-xl font-bold text-slate-900 mt-0.5">{importSummary.updated}</p>
                      </div>
                      <div className="text-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Skipped</span>
                        <p className="text-xl font-bold text-slate-900 mt-0.5">{importSummary.skipped}</p>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-150 flex items-center justify-between shrink-0 bg-slate-50/50">
                <button
                  type="button"
                  onClick={handleCloseImportModal}
                  disabled={importLoading}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
                >
                  {importSummary ? 'Done' : 'Cancel'}
                </button>

                {!importSummary && parsedRows.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExecuteImport}
                    disabled={importLoading}
                    className="rounded-lg bg-indigo-600 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-indigo-500 shadow-md shadow-indigo-500/10 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {importLoading ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing...
                      </>
                    ) : (
                      'Execute Import'
                    )}
                  </button>
                )}
              </div>

            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}

export default function EmployeesPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-650" />
      </div>
    }>
      <EmployeesContent />
    </Suspense>
  );
}
