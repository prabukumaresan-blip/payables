import { formatOMR } from '@/lib/utils/formatCurrency';
import { format, parseISO } from 'date-fns';

export interface WhatsAppPaymentParams {
  vendorName: string;
  phoneNumber?: string | null;
  amount: number;
  paymentDate?: string | null;
  referenceNo?: string | null;
  bankAccount?: string | null;
  companyName?: string | null;
  title?: string | null;
}

/**
 * Clean phone number into international format without symbols
 * Supports Oman (+968) default if 8 digits without country code.
 * Ensures number is formatted strictly as digits (e.g. 96891234567) so WhatsApp Mac App opens the exact chat.
 */
export function formatWhatsAppPhoneNumber(phone?: string | null): string {
  if (!phone) return '';
  // Remove spaces, dashes, brackets, and any non-digit/non-plus chars
  let cleaned = phone.trim().replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  } else if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }

  // Remove leading zeros after country code if any
  cleaned = cleaned.replace(/^0+/, '');

  // If standard Oman 8-digit mobile/landline number starting with 7, 9, or 2, prefix 968
  if (cleaned.length === 8 && (cleaned.startsWith('9') || cleaned.startsWith('7') || cleaned.startsWith('2'))) {
    cleaned = '968' + cleaned;
  }

  return cleaned;
}

/**
 * Builds professional payment confirmation WhatsApp message
 */
export function buildPaymentWhatsAppMessage(params: WhatsAppPaymentParams): string {
  let formattedDate = '';
  try {
    if (params.paymentDate) {
      const parsed = typeof params.paymentDate === 'string' && params.paymentDate.includes('T')
        ? parseISO(params.paymentDate)
        : new Date(params.paymentDate);
      if (!isNaN(parsed.getTime())) {
        formattedDate = format(parsed, 'dd MMM yyyy');
      } else {
        formattedDate = params.paymentDate;
      }
    } else {
      formattedDate = format(new Date(), 'dd MMM yyyy');
    }
  } catch {
    formattedDate = params.paymentDate || format(new Date(), 'dd MMM yyyy');
  }

  const sender = params.companyName ? params.companyName.trim() : 'Accounts Department';

  const lines = [
    `*PAYMENT CONFIRMATION ADVICE*`,
    `----------------------------------------`,
    `Dear *${params.vendorName || 'Valued Partner'}*,`,
    ``,
    `We are pleased to inform you that a payment has been processed to your account.`,
    ``,
    `*Payment Details:*`,
    `• *Amount:* ${formatOMR(params.amount)}`,
    `• *Payment Date:* ${formattedDate}`,
    params.referenceNo ? `• *Reference / Txn No:* ${params.referenceNo}` : null,
    params.bankAccount ? `• *Credited Account:* ${params.bankAccount}` : null,
    params.title ? `• *Regarding / Bill:* ${params.title}` : null,
    ``,
    `Please check your bank account and feel free to reach out if you have any questions.`,
    ``,
    `Best regards,`,
    `*${sender}*`
  ].filter(line => line !== null);

  return lines.join('\n');
}

/**
 * Generates WhatsApp URL
 * If preferDesktopApp is true, returns whatsapp:// protocol URL to open the Mac Desktop App directly.
 */
export function getWhatsAppShareUrl(params: WhatsAppPaymentParams, preferDesktopApp = false): string {
  const phone = formatWhatsAppPhoneNumber(params.phoneNumber);
  const text = buildPaymentWhatsAppMessage(params);
  const encodedText = encodeURIComponent(text);

  if (preferDesktopApp) {
    if (phone) {
      return `whatsapp://send?phone=${phone}&text=${encodedText}`;
    }
    return `whatsapp://send?text=${encodedText}`;
  }

  if (phone) {
    return `https://wa.me/${phone}?text=${encodedText}`;
  }
  return `https://api.whatsapp.com/send?text=${encodedText}`;
}
import { getVendors, getEmployees, getLandowners } from '@/lib/supabase/queries';
import type { Payable } from '@/lib/supabase/mockDb';

/**
 * Helper to fetch and resolve phone number for a payable's vendor/employee/landowner
 */
export async function resolvePayablePhone(payable: Partial<Payable>): Promise<string | null> {
  const targetName = (payable.vendor_name || payable.title || '').trim().toLowerCase();
  if (!targetName) return null;

  try {
    const [vList, empList, landList] = await Promise.all([
      getVendors().catch(() => []),
      getEmployees().catch(() => []),
      getLandowners().catch(() => [])
    ]);

    const vMatch = vList.find(v => (v.name || '').trim().toLowerCase() === targetName);
    if (vMatch && vMatch.phone) return vMatch.phone;

    const eMatch = empList.find(e => (e.name || '').trim().toLowerCase() === targetName);
    if (eMatch && eMatch.phone) return eMatch.phone;

    const lMatch = landList.find(l => (l.name || '').trim().toLowerCase() === targetName);
    if (lMatch && lMatch.phone) return lMatch.phone;

    // Check by contact person if available
    const contactMatch = vList.find(v => (v.contact_person || '').trim().toLowerCase() === targetName);
    if (contactMatch && contactMatch.phone) return contactMatch.phone;

  } catch (e) {
    console.warn('Could not resolve phone number for payable:', e);
  }

  return null;
}

/**
 * Triggers WhatsApp directly on macOS Desktop App (net.whatsapp.WhatsApp) or opens WhatsApp Web
 */
export function openWhatsApp(params: WhatsAppPaymentParams): void {
  try {
    const phone = formatWhatsAppPhoneNumber(params.phoneNumber);
    const text = buildPaymentWhatsAppMessage(params);
    const encodedText = encodeURIComponent(text);

    // If phone exists, open wa.me / native desktop URL
    const desktopUrl = phone
      ? `whatsapp://send?phone=${phone}&text=${encodedText}`
      : `whatsapp://send?text=${encodedText}`;

    // Try opening via hidden anchor / iframe or window to seamlessly launch WhatsApp
    if (typeof window !== 'undefined') {
      const a = document.createElement('a');
      a.href = desktopUrl;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
      }, 500);
    }
  } catch (err) {
    console.error('Failed to launch WhatsApp Desktop:', err);
  }
}

/**
 * Automatically triggers WhatsApp payment advice for a payable marked as paid
 */
export async function sendWhatsAppForPaidPayable(
  payable: Partial<Payable> & { amount: number; title: string },
  options?: {
    phoneNumber?: string | null;
    paymentDate?: string | null;
    amount?: number | null;
    referenceNo?: string | null;
    bankAccount?: string | null;
  }
): Promise<boolean> {
  try {
    const phone = options?.phoneNumber || await resolvePayablePhone(payable);
    const amountToSend = options?.amount !== undefined && options?.amount !== null 
      ? Number(options.amount) 
      : (Number(payable.paid_amount) || Number(payable.amount) || 0);

    const paymentDateToSend = options?.paymentDate || payable.payment_date || format(new Date(), 'yyyy-MM-dd');
    const refToSend = options?.referenceNo !== undefined ? options.referenceNo : payable.reference_no;
    const bankAccountToSend = options?.bankAccount !== undefined ? options.bankAccount : payable.bank_account;

    openWhatsApp({
      vendorName: payable.vendor_name || payable.title,
      phoneNumber: phone,
      amount: amountToSend,
      paymentDate: paymentDateToSend,
      referenceNo: refToSend,
      bankAccount: bankAccountToSend,
      companyName: payable.company?.name || null,
      title: payable.title
    });

    return true;
  } catch (err) {
    console.error('Error in sendWhatsAppForPaidPayable:', err);
    return false;
  }
}
