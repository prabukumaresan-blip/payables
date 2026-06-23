import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { Payable, Vendor, Employee, Landowner } from '../supabase/mockDb';

export interface ParsedPaymentRow {
  type: 'DR' | 'CR';
  accountNumber: string;
  name: string;
  amount: number;
  employee: string;
  remarks: string;
  rowIndex: number; // 1-indexed row number in Excel sheet
}

export interface MatchedPaymentResult {
  row: ParsedPaymentRow;
  matchedPayable: Payable | null;
  matchStatus: 'matched' | 'already_paid' | 'multiple_matches' | 'no_match';
  matchReason: string;
  allCandidates?: Payable[];
}

/**
 * Parses an Excel or CSV file and extracts the payment rows.
 */
export async function parsePaymentFile(file: File): Promise<ParsedPaymentRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          throw new Error('Could not read file data');
        }

        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to array of arrays to handle headers dynamically
        const jsonRows = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(worksheet, { header: 1 });
        
        if (jsonRows.length === 0) {
          resolve([]);
          return;
        }

        // Search for the header row containing 'CR/DR' or find columns by keywords
        let headerIndex = 0;
        const colIndices = {
          type: 0,
          accountNumber: 1,
          name: 2,
          amount: 3,
          employee: 4,
          remarks: 5
        };

        let foundHeader = false;
        for (let i = 0; i < Math.min(10, jsonRows.length); i++) {
          const row = jsonRows[i];
          if (row && row.some(cell => typeof cell === 'string' && cell.toUpperCase().trim().includes('CR/DR'))) {
            headerIndex = i;
            foundHeader = true;
            
            // Map indices dynamically
            row.forEach((cell, idx) => {
              if (cell === null || cell === undefined) return;
              const strVal = String(cell).toLowerCase().trim();
              if (strVal.includes('cr/dr')) colIndices.type = idx;
              else if (strVal.includes('account')) colIndices.accountNumber = idx;
              else if (strVal.includes('name')) colIndices.name = idx;
              else if (strVal.includes('amount')) colIndices.amount = idx;
              else if (strVal.includes('employee')) colIndices.employee = idx;
              else if (strVal.includes('remarks')) colIndices.remarks = idx;
            });
            break;
          }
        }

        // If we didn't find an explicit header row, assume index 0 is the header and use default indices
        const startRow = foundHeader ? headerIndex + 1 : 1;
        const parsedRows: ParsedPaymentRow[] = [];

        for (let i = startRow; i < jsonRows.length; i++) {
          const row = jsonRows[i];
          if (!row || row.length === 0) continue;
          
          const typeVal = String(row[colIndices.type] || '').trim().toUpperCase();
          // Skip if type is empty or doesn't match CR/DR
          if (typeVal !== 'CR' && typeVal !== 'DR') continue;

          const accNum = String(row[colIndices.accountNumber] || '').trim();
          const name = String(row[colIndices.name] || '').trim();
          const amtVal = parseFloat(String(row[colIndices.amount] || '0').replace(/[^0-9.]/g, ''));
          const employee = String(row[colIndices.employee] || '').trim();
          const remarks = String(row[colIndices.remarks] || '').trim();

          parsedRows.push({
            type: typeVal as 'DR' | 'CR',
            accountNumber: accNum,
            name: name,
            amount: isNaN(amtVal) ? 0 : amtVal,
            employee: employee,
            remarks: remarks,
            rowIndex: i + 1
          });
        }

        resolve(parsedRows);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => {
      reject(new Error('File reading error'));
    };

    reader.readAsBinaryString(file);
  });
}

/**
 * Clean account numbers to retain only digits/characters for matching
 */
function cleanAccount(acc: string): string {
  return acc.replace(/[^a-zA-Z0-9]/g, '').replace(/^0+/, ''); // clean and strip leading zeros
}

/**
 * Score matches between a parsed CR payment row and an existing payable
 */
function calculateMatchScore(row: ParsedPaymentRow, payable: Payable): { score: number; reason: string } {
  // Amount MUST match within small tolerance (OMR has 3 decimals)
  const amountDiff = Math.abs(row.amount - payable.amount);
  if (amountDiff >= 0.005) {
    return { score: 0, reason: 'Amount mismatch' };
  }

  let score = 0;
  const reasons: string[] = [];

  // Account match (highest priority)
  const cleanRowAcc = cleanAccount(row.accountNumber);
  const cleanPayableAcc = cleanAccount(payable.bank_account || '');
  
  if (cleanRowAcc && cleanPayableAcc) {
    if (cleanRowAcc === cleanPayableAcc) {
      score += 20;
      reasons.push('Exact account match');
    } else if (cleanPayableAcc.includes(cleanRowAcc) || cleanRowAcc.includes(cleanPayableAcc)) {
      score += 12;
      reasons.push('Partial account match');
    }
  }

  // Name match
  const cleanRowName = row.name.toLowerCase().trim();
  const cleanPayableName = (payable.vendor_name || '').toLowerCase().trim();
  const cleanTitle = payable.title.toLowerCase().trim();

  if (cleanRowName && cleanPayableName) {
    if (cleanRowName === cleanPayableName) {
      score += 15;
      reasons.push('Exact vendor name match');
    } else if (cleanPayableName.includes(cleanRowName) || cleanRowName.includes(cleanPayableName)) {
      score += 8;
      reasons.push('Partial vendor name match');
    }
  } else if (cleanRowName && cleanTitle) {
    // Fallback: match name in row with payable title (e.g. "Vendor Payment - BRIGHT FLOWERS")
    if (cleanTitle.includes(cleanRowName) || cleanRowName.includes(cleanTitle)) {
      score += 5;
      reasons.push('Row name matches payable title');
    }
  }

  return {
    score,
    reason: reasons.join(', ') || 'Amount matches'
  };
}

/**
 * Matches a list of parsed payment rows with the database's payables
 */
export function matchPaymentRows(
  rows: ParsedPaymentRow[],
  allPayables: Payable[]
): MatchedPaymentResult[] {
  // Only process CR (Credit) rows for matching vendors. 
  // DR (Debit) row is the company's funding account and doesn't represent a vendor payable.
  const crRows = rows.filter(r => r.type === 'CR');

  return crRows.map(row => {
    const candidates = allPayables.map(payable => {
      const match = calculateMatchScore(row, payable);
      return { payable, ...match };
    }).filter(c => c.score > 0);

    if (candidates.length === 0) {
      return {
        row,
        matchedPayable: null,
        matchStatus: 'no_match',
        matchReason: 'No payable found matching amount and name/account'
      };
    }

    // Sort by match score descending
    candidates.sort((a, b) => b.score - a.score);

    // Filter candidates by status. We strongly prefer unpaid (pending, overdue, partial) over paid/cancelled
    const unpaidCandidates = candidates.filter(
      c => c.payable.status === 'pending' || c.payable.status === 'overdue' || c.payable.status === 'partial'
    );

    if (unpaidCandidates.length > 0) {
      const highestScore = unpaidCandidates[0].score;
      const bestUnpaidMatches = unpaidCandidates.filter(c => c.score === highestScore);

      if (bestUnpaidMatches.length === 1) {
        return {
          row,
          matchedPayable: bestUnpaidMatches[0].payable,
          matchStatus: 'matched',
          matchReason: bestUnpaidMatches[0].reason
        };
      } else {
        // Multiple unpaid matches with the same score
        return {
          row,
          matchedPayable: bestUnpaidMatches[0].payable, // Select first but mark multiple
          matchStatus: 'multiple_matches',
          matchReason: `Multiple pending matches found (${bestUnpaidMatches.length}). Pre-selected best match.`,
          allCandidates: bestUnpaidMatches.map(c => c.payable)
        };
      }
    }

    // If no unpaid matches, look at already paid candidates
    const paidCandidates = candidates.filter(c => c.payable.status === 'paid');
    if (paidCandidates.length > 0) {
      const highestScore = paidCandidates[0].score;
      const bestPaidMatches = paidCandidates.filter(c => c.score === highestScore);
      
      return {
        row,
        matchedPayable: bestPaidMatches[0].payable,
        matchStatus: 'already_paid',
        matchReason: `Found matching payable, but it is already PAID (${bestPaidMatches[0].reason})`
      };
    }

    // Otherwise, matches are cancelled or others
    return {
      row,
      matchedPayable: candidates[0].payable,
      matchStatus: 'no_match',
      matchReason: `Matching payable is ${candidates[0].payable.status.toUpperCase()} (${candidates[0].reason})`
    };
  });
}

/**
 * Cleans a bank account string from a payable (which might include a bank name, like "Bank Muscat - 0371024")
 * and extracts just the account number.
 */
export function extractAccountNumber(bankAccountStr: string | null): string {
  if (!bankAccountStr) return '';
  const parts = bankAccountStr.split('-');
  // If format is "Bank Muscat - XXXXX", take the last part
  if (parts.length > 1) {
    return parts[parts.length - 1].trim();
  }
  return bankAccountStr.trim();
}

/**
 * Generates a unique reference identifier for a payment export batch.
 * Format: EXPYYMMDDRAND4 (e.g., EXP260621E5F2) - No symbols
 */
export function generateUniqueExportId(): string {
  const dateStr = format(new Date(), 'yyMMdd');
  const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `EXP${dateStr}${randomStr}`;
}

/**
 * Generates an Excel spreadsheet matching the exact layout of VendorPaymentSample.xlsx
 */
export function generatePaymentExcelFile(
  selectedPayables: Payable[],
  vendors: Vendor[],
  employees: Employee[],
  landowners: Landowner[],
  debitAccount: string,
  debitName: string,
  remarks: string,
  individualRemarks?: Record<string, string>,
  uniqueId?: string
): { blob: Blob; filename: string } {
  // Helper to format and sanitize remarks: upper-case, strip symbols, truncate to 30 characters
  const formatRemark = (baseRemark: string, uId?: string) => {
    let combined = uId ? `${baseRemark.trim()} ${uId}` : baseRemark.trim();
    // Strip symbols (only allow letters, numbers, and spaces)
    combined = combined.replace(/[^a-zA-Z0-9 ]/g, '');
    // Normalize spaces
    combined = combined.replace(/\s+/g, ' ');
    return combined.substring(0, 30).toUpperCase();
  };

  // Check if any selected vendor is an OTHER BANK vendor
  const isOtherBank = selectedPayables.some(p => {
    const v = vendors.find(vendor => vendor.name === p.vendor_name);
    if (v) return v.bank_type === 'OTHER_BANK';
    const e = employees?.find(emp => emp.name === p.vendor_name);
    if (e) return e.bank_type === 'OTHER_BANK';
    const l = landowners?.find(land => land.name === p.vendor_name);
    if (l) return l.bank_type === 'OTHER_BANK';
    return false;
  });

  const totalAmount = selectedPayables.reduce((sum, p) => sum + (p.amount - (p.paid_amount || 0)), 0);
  const dataRows: (string | number)[][] = [];

  if (isOtherBank) {
    // 7-column layout matching OtherBankVendorPayment.xls
    const headers = ['CR/DR', 'Account Number', 'Name', 'Amount', 'Employee', 'Remarks', 'BankCode'];
    dataRows.push(headers);

    // DR Row (debit account)
    dataRows.push([
      'DR',
      debitAccount.trim(),
      debitName.trim().toUpperCase(),
      totalAmount,
      '', // Employee is empty
      formatRemark(remarks, uniqueId),
      'BMUSOMRX' // Default Bank Muscat bank code for the debit account
    ]);

    // CR Rows
    selectedPayables.forEach(p => {
      const cleanAcc = extractAccountNumber(p.bank_account);
      
      const vendorObj = vendors.find(v => v.name === p.vendor_name);
      const employeeObj = employees?.find(e => e.name === p.vendor_name);
      const landownerObj = landowners?.find(l => l.name === p.vendor_name);

      let accNum = cleanAcc || p.bank_account || '';
      let swiftCode = '';

      if (vendorObj) {
        if (vendorObj.account_no) accNum = vendorObj.account_no;
        if (vendorObj.swift_code) swiftCode = vendorObj.swift_code;
      } else if (employeeObj) {
        if (employeeObj.account_no) accNum = employeeObj.account_no;
        if (employeeObj.swift_code) swiftCode = employeeObj.swift_code || '';
      } else if (landownerObj) {
        if (landownerObj.account_no) accNum = landownerObj.account_no;
        if (landownerObj.swift_code) swiftCode = landownerObj.swift_code || '';
      }

      const rowRemark = (individualRemarks?.[p.id] || '').trim() || remarks;

      dataRows.push([
        'CR',
        accNum,
        (p.vendor_name || p.title).trim().toUpperCase(),
        p.amount - (p.paid_amount || 0),
        '  ', // spaces
        formatRemark(rowRemark, uniqueId),
        (swiftCode || '').toUpperCase()
      ]);
    });
  } else {
    // Standard 6-column layout matching VendorPaymentSample.xlsx
    const headers = ['CR/DR', 'Account Number', 'Name', 'Amount', 'Employee', 'Remarks'];
    dataRows.push(headers);

    // DR Row
    dataRows.push([
      'DR',
      debitAccount.trim(),
      debitName.trim().toUpperCase(),
      totalAmount,
      '', // Employee is empty
      formatRemark(remarks, uniqueId)
    ]);

    // CR Rows
    selectedPayables.forEach(p => {
      const cleanAcc = extractAccountNumber(p.bank_account);
      
      const vendorObj = vendors.find(v => v.name === p.vendor_name);
      const employeeObj = employees?.find(e => e.name === p.vendor_name);
      const landownerObj = landowners?.find(l => l.name === p.vendor_name);

      let accNum = cleanAcc || p.bank_account || '';

      if (vendorObj) {
        if (vendorObj.account_no) accNum = vendorObj.account_no;
      } else if (employeeObj) {
        if (employeeObj.account_no) accNum = employeeObj.account_no;
      } else if (landownerObj) {
        if (landownerObj.account_no) accNum = landownerObj.account_no;
      }

      const rowRemark = (individualRemarks?.[p.id] || '').trim() || remarks;

      dataRows.push([
        'CR',
        accNum,
        (p.vendor_name || p.title).trim().toUpperCase(),
        p.amount - (p.paid_amount || 0),
        '  ',
        formatRemark(rowRemark, uniqueId)
      ]);
    });
  }

  // 5. Create Sheet and Workbook
  const worksheet = XLSX.utils.aoa_to_sheet(dataRows);
  
  // Set cell types and formats for Amount column to double decimal numbers
  // Row indices: DR is row 2 (index 1), CRs are row 3+ (index 2+)
  // Column 3 is Amount (index 3)
  const range = XLSX.utils.decode_range(worksheet['!ref'] || (isOtherBank ? 'A1:G' : 'A1:F') + dataRows.length);
  for (let r = range.s.r + 1; r <= range.e.r; ++r) {
    const amountCellRef = XLSX.utils.encode_cell({ r, c: 3 });
    const cell = worksheet[amountCellRef];
    if (cell && typeof cell.v === 'number') {
      cell.t = 'n';
      cell.z = '0.000'; // OMR 3-decimal formatting
    }
  }

  // Set column widths
  if (isOtherBank) {
    worksheet['!cols'] = [
      { wch: 8 },  // CR/DR
      { wch: 22 }, // Account Number
      { wch: 32 }, // Name
      { wch: 12 }, // Amount
      { wch: 10 }, // Employee
      { wch: 15 }, // Remarks
      { wch: 15 }  // BankCode
    ];
  } else {
    worksheet['!cols'] = [
      { wch: 8 },  // CR/DR
      { wch: 22 }, // Account Number
      { wch: 32 }, // Name
      { wch: 12 }, // Amount
      { wch: 10 }, // Employee
      { wch: 15 }  // Remarks
    ];
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

  // 6. Write workbook binary array
  const wopts: XLSX.WritingOptions = { bookType: 'xlsx', bookSST: false, type: 'binary' };
  const wbout = XLSX.write(workbook, wopts);

  // 7. Convert binary string to Blob
  const buf = new ArrayBuffer(wbout.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < wbout.length; i++) {
    view[i] = wbout.charCodeAt(i) & 0xff;
  }

  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  
  const filename = isOtherBank 
    ? `VP_Other_${uniqueId || 'EXPORT'}.xlsx` 
    : `VP_Muscat_${uniqueId || 'EXPORT'}.xlsx`;

  return { blob, filename };
}

export interface ParsedVendorRow {
  name: string;
  bank_type: 'BANK_MUSCAT' | 'OTHER_BANK';
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  bank_name: string | null;
  account_no: string | null;
  swift_code: string | null;
  rowIndex: number;
}

/**
 * Parses an Excel file containing vendor details.
 */
export async function parseVendorImportFile(file: File): Promise<ParsedVendorRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          throw new Error('Could not read file data');
        }

        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to array of arrays
        const jsonRows = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(worksheet, { header: 1 });
        
        if (jsonRows.length === 0) {
          resolve([]);
          return;
        }

        // Standard headers we look for
        let headerIndex = 0;
        const colIndices = {
          name: -1,
          bankType: -1,
          contactPerson: -1,
          email: -1,
          phone: -1,
          bankName: -1,
          accountNo: -1,
          swiftCode: -1
        };

        let foundHeader = false;
        for (let i = 0; i < Math.min(10, jsonRows.length); i++) {
          const row = jsonRows[i];
          if (row && row.some(cell => typeof cell === 'string' && cell.toLowerCase().trim() === 'name')) {
            headerIndex = i;
            foundHeader = true;
            
            row.forEach((cell, idx) => {
              if (cell === null || cell === undefined) return;
              const strVal = String(cell).toLowerCase().trim();
              if (strVal === 'name') colIndices.name = idx;
              else if (strVal === 'bank type' || strVal === 'banktype') colIndices.bankType = idx;
              else if (strVal === 'contact person' || strVal === 'contactperson' || strVal === 'contact') colIndices.contactPerson = idx;
              else if (strVal === 'email' || strVal === 'email address') colIndices.email = idx;
              else if (strVal === 'phone' || strVal === 'phone number') colIndices.phone = idx;
              else if (strVal === 'bank name' || strVal === 'bankname') colIndices.bankName = idx;
              else if (strVal === 'account number' || strVal === 'accountno' || strVal === 'account_no' || strVal === 'account') colIndices.accountNo = idx;
              else if (strVal === 'swift code' || strVal === 'swiftcode' || strVal === 'swift_code') colIndices.swiftCode = idx;
            });
            break;
          }
        }

        // If we didn't find a header row containing 'name', look at row 0 or assume default order
        if (!foundHeader) {
          colIndices.name = 0;
          colIndices.bankType = 1;
          colIndices.contactPerson = 2;
          colIndices.email = 3;
          colIndices.phone = 4;
          colIndices.bankName = 5;
          colIndices.accountNo = 6;
          colIndices.swiftCode = 7;
        }

        const startRow = foundHeader ? headerIndex + 1 : 1;
        const parsedRows: ParsedVendorRow[] = [];

        for (let i = startRow; i < jsonRows.length; i++) {
          const row = jsonRows[i];
          if (!row || row.length === 0) continue;
          
          // Skip completely empty rows
          const hasData = row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
          if (!hasData) continue;

          const nameVal = colIndices.name >= 0 ? String(row[colIndices.name] || '').trim() : '';
          
          const rawBankType = colIndices.bankType >= 0 ? String(row[colIndices.bankType] || '').trim().toUpperCase() : 'BANK_MUSCAT';
          const bankTypeVal: 'BANK_MUSCAT' | 'OTHER_BANK' = (rawBankType === 'OTHER_BANK' || rawBankType === 'OTHER_BANK') 
            ? 'OTHER_BANK' 
            : 'BANK_MUSCAT';

          const contactPersonVal = colIndices.contactPerson >= 0 && row[colIndices.contactPerson] !== undefined 
            ? String(row[colIndices.contactPerson]).trim() 
            : null;
          const emailVal = colIndices.email >= 0 && row[colIndices.email] !== undefined 
            ? String(row[colIndices.email]).trim() 
            : null;
          const phoneVal = colIndices.phone >= 0 && row[colIndices.phone] !== undefined 
            ? String(row[colIndices.phone]).trim() 
            : null;
          const bankNameVal = colIndices.bankName >= 0 && row[colIndices.bankName] !== undefined 
            ? String(row[colIndices.bankName]).trim() 
            : null;
          const accountNoVal = colIndices.accountNo >= 0 && row[colIndices.accountNo] !== undefined 
            ? String(row[colIndices.accountNo]).trim() 
            : null;
          const swiftCodeVal = colIndices.swiftCode >= 0 && row[colIndices.swiftCode] !== undefined 
            ? String(row[colIndices.swiftCode]).trim().toUpperCase() 
            : null;

          parsedRows.push({
            name: nameVal,
            bank_type: bankTypeVal,
            contact_person: contactPersonVal || null,
            email: emailVal || null,
            phone: phoneVal || null,
            bank_name: bankNameVal || null,
            account_no: accountNoVal || null,
            swift_code: swiftCodeVal || null,
            rowIndex: i + 1
          });
        }

        resolve(parsedRows);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => {
      reject(new Error('File reading error'));
    };

    reader.readAsBinaryString(file);
  });
}

export interface ParsedEmployeeRow {
  name: string;
  bank_type: 'BANK_MUSCAT' | 'OTHER_BANK';
  department: string | null;
  email: string | null;
  phone: string | null;
  bank_name: string | null;
  account_no: string | null;
  swift_code: string | null;
  rowIndex: number;
}

export interface ParsedLandownerRow {
  name: string;
  bank_type: 'BANK_MUSCAT' | 'OTHER_BANK';
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  bank_name: string | null;
  account_no: string | null;
  swift_code: string | null;
  rowIndex: number;
}

/**
 * Parses an Excel file containing employee details.
 */
export async function parseEmployeeImportFile(file: File): Promise<ParsedEmployeeRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          throw new Error('Could not read file data');
        }

        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to array of arrays
        const jsonRows = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(worksheet, { header: 1 });
        
        if (jsonRows.length === 0) {
          resolve([]);
          return;
        }

        // Standard headers we look for
        let headerIndex = 0;
        const colIndices = {
          name: -1,
          bankType: -1,
          department: -1,
          email: -1,
          phone: -1,
          bankName: -1,
          accountNo: -1,
          swiftCode: -1
        };

        let foundHeader = false;
        for (let i = 0; i < Math.min(10, jsonRows.length); i++) {
          const row = jsonRows[i];
          if (row && row.some(cell => typeof cell === 'string' && cell.toLowerCase().trim() === 'name')) {
            headerIndex = i;
            foundHeader = true;
            
            row.forEach((cell, idx) => {
              if (cell === null || cell === undefined) return;
              const strVal = String(cell).toLowerCase().trim();
              if (strVal === 'name' || strVal === 'employee name' || strVal === 'employeename') colIndices.name = idx;
              else if (strVal === 'bank type' || strVal === 'banktype') colIndices.bankType = idx;
              else if (strVal === 'department' || strVal === 'dept') colIndices.department = idx;
              else if (strVal === 'email' || strVal === 'email address') colIndices.email = idx;
              else if (strVal === 'phone' || strVal === 'phone number' || strVal === 'mobile') colIndices.phone = idx;
              else if (strVal === 'bank name' || strVal === 'bankname') colIndices.bankName = idx;
              else if (strVal === 'account number' || strVal === 'accountno' || strVal === 'account_no' || strVal === 'account') colIndices.accountNo = idx;
              else if (strVal === 'swift code' || strVal === 'swiftcode' || strVal === 'swift_code') colIndices.swiftCode = idx;
            });
            break;
          }
        }

        // If we didn't find a header row containing 'name', look at row 0 or assume default order
        if (!foundHeader) {
          colIndices.name = 0;
          colIndices.bankType = 1;
          colIndices.department = 2;
          colIndices.email = 3;
          colIndices.phone = 4;
          colIndices.bankName = 5;
          colIndices.accountNo = 6;
          colIndices.swiftCode = 7;
        }

        const startRow = foundHeader ? headerIndex + 1 : 1;
        const parsedRows: ParsedEmployeeRow[] = [];

        for (let i = startRow; i < jsonRows.length; i++) {
          const row = jsonRows[i];
          if (!row || row.length === 0) continue;
          
          // Skip completely empty rows
          const hasData = row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
          if (!hasData) continue;

          const nameVal = colIndices.name >= 0 ? String(row[colIndices.name] || '').trim() : '';
          
          const rawBankType = colIndices.bankType >= 0 ? String(row[colIndices.bankType] || '').trim().toUpperCase() : 'BANK_MUSCAT';
          const bankTypeVal: 'BANK_MUSCAT' | 'OTHER_BANK' = (rawBankType === 'OTHER_BANK') 
            ? 'OTHER_BANK' 
            : 'BANK_MUSCAT';

          const departmentVal = colIndices.department >= 0 && row[colIndices.department] !== undefined 
            ? String(row[colIndices.department]).trim() 
            : null;
          const emailVal = colIndices.email >= 0 && row[colIndices.email] !== undefined 
            ? String(row[colIndices.email]).trim() 
            : null;
          const phoneVal = colIndices.phone >= 0 && row[colIndices.phone] !== undefined 
            ? String(row[colIndices.phone]).trim() 
            : null;
          const bankNameVal = colIndices.bankName >= 0 && row[colIndices.bankName] !== undefined 
            ? String(row[colIndices.bankName]).trim() 
            : null;
          const accountNoVal = colIndices.accountNo >= 0 && row[colIndices.accountNo] !== undefined 
            ? String(row[colIndices.accountNo]).trim() 
            : null;
          const swiftCodeVal = colIndices.swiftCode >= 0 && row[colIndices.swiftCode] !== undefined 
            ? String(row[colIndices.swiftCode]).trim().toUpperCase() 
            : null;

          parsedRows.push({
            name: nameVal,
            bank_type: bankTypeVal,
            department: departmentVal || null,
            email: emailVal || null,
            phone: phoneVal || null,
            bank_name: bankNameVal || null,
            account_no: accountNoVal || null,
            swift_code: swiftCodeVal || null,
            rowIndex: i + 1
          });
        }

        resolve(parsedRows);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => {
      reject(new Error('File reading error'));
    };

    reader.readAsBinaryString(file);
  });
}

/**
 * Parses an Excel file containing landowner details.
 */
export async function parseLandownerImportFile(file: File): Promise<ParsedLandownerRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          throw new Error('Could not read file data');
        }

        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to array of arrays
        const jsonRows = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(worksheet, { header: 1 });
        
        if (jsonRows.length === 0) {
          resolve([]);
          return;
        }

        // Standard headers we look for
        let headerIndex = 0;
        const colIndices = {
          name: -1,
          bankType: -1,
          contactPerson: -1,
          email: -1,
          phone: -1,
          bankName: -1,
          accountNo: -1,
          swiftCode: -1
        };

        let foundHeader = false;
        for (let i = 0; i < Math.min(10, jsonRows.length); i++) {
          const row = jsonRows[i];
          if (row && row.some(cell => typeof cell === 'string' && cell.toLowerCase().trim() === 'name')) {
            headerIndex = i;
            foundHeader = true;
            
            row.forEach((cell, idx) => {
              if (cell === null || cell === undefined) return;
              const strVal = String(cell).toLowerCase().trim();
              if (strVal === 'name' || strVal === 'landowner name' || strVal === 'landownername' || strVal === 'owner name' || strVal === 'owner') colIndices.name = idx;
              else if (strVal === 'bank type' || strVal === 'banktype') colIndices.bankType = idx;
              else if (strVal === 'contact person' || strVal === 'contactperson' || strVal === 'contact') colIndices.contactPerson = idx;
              else if (strVal === 'email' || strVal === 'email address') colIndices.email = idx;
              else if (strVal === 'phone' || strVal === 'phone number' || strVal === 'mobile') colIndices.phone = idx;
              else if (strVal === 'bank name' || strVal === 'bankname') colIndices.bankName = idx;
              else if (strVal === 'account number' || strVal === 'accountno' || strVal === 'account_no' || strVal === 'account') colIndices.accountNo = idx;
              else if (strVal === 'swift code' || strVal === 'swiftcode' || strVal === 'swift_code') colIndices.swiftCode = idx;
            });
            break;
          }
        }

        // If we didn't find a header row containing 'name', look at row 0 or assume default order
        if (!foundHeader) {
          colIndices.name = 0;
          colIndices.bankType = 1;
          colIndices.contactPerson = 2;
          colIndices.email = 3;
          colIndices.phone = 4;
          colIndices.bankName = 5;
          colIndices.accountNo = 6;
          colIndices.swiftCode = 7;
        }

        const startRow = foundHeader ? headerIndex + 1 : 1;
        const parsedRows: ParsedLandownerRow[] = [];

        for (let i = startRow; i < jsonRows.length; i++) {
          const row = jsonRows[i];
          if (!row || row.length === 0) continue;
          
          // Skip completely empty rows
          const hasData = row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
          if (!hasData) continue;

          const nameVal = colIndices.name >= 0 ? String(row[colIndices.name] || '').trim() : '';
          
          const rawBankType = colIndices.bankType >= 0 ? String(row[colIndices.bankType] || '').trim().toUpperCase() : 'BANK_MUSCAT';
          const bankTypeVal: 'BANK_MUSCAT' | 'OTHER_BANK' = (rawBankType === 'OTHER_BANK') 
            ? 'OTHER_BANK' 
            : 'BANK_MUSCAT';

          const contactPersonVal = colIndices.contactPerson >= 0 && row[colIndices.contactPerson] !== undefined 
            ? String(row[colIndices.contactPerson]).trim() 
            : null;
          const emailVal = colIndices.email >= 0 && row[colIndices.email] !== undefined 
            ? String(row[colIndices.email]).trim() 
            : null;
          const phoneVal = colIndices.phone >= 0 && row[colIndices.phone] !== undefined 
            ? String(row[colIndices.phone]).trim() 
            : null;
          const bankNameVal = colIndices.bankName >= 0 && row[colIndices.bankName] !== undefined 
            ? String(row[colIndices.bankName]).trim() 
            : null;
          const accountNoVal = colIndices.accountNo >= 0 && row[colIndices.accountNo] !== undefined 
            ? String(row[colIndices.accountNo]).trim() 
            : null;
          const swiftCodeVal = colIndices.swiftCode >= 0 && row[colIndices.swiftCode] !== undefined 
            ? String(row[colIndices.swiftCode]).trim().toUpperCase() 
            : null;

          parsedRows.push({
            name: nameVal,
            bank_type: bankTypeVal,
            contact_person: contactPersonVal || null,
            email: emailVal || null,
            phone: phoneVal || null,
            bank_name: bankNameVal || null,
            account_no: accountNoVal || null,
            swift_code: swiftCodeVal || null,
            rowIndex: i + 1
          });
        }

        resolve(parsedRows);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => {
      reject(new Error('File reading error'));
    };

    reader.readAsBinaryString(file);
  });
}

