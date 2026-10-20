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
  } catch (err) {
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

/**
 * Triggers WhatsApp directly in Mac Desktop app, falling back cleanly to WhatsApp Web / https://wa.me
 */
/**
/**
 * Triggers WhatsApp directly on macOS Desktop App (net.whatsapp.WhatsApp)
 * Using the native 'whatsapp://send?phone=...&text=...' protocol directly invokes
 * the Mac Desktop application and focuses the specific contact.
 */
export function openWhatsApp(params: WhatsAppPaymentParams): void {
  try {
    const phone = formatWhatsAppPhoneNumber(params.phoneNumber);
    const text = buildPaymentWhatsAppMessage(params);
    const encodedText = encodeURIComponent(text);

    // Direct desktop app scheme: whatsapp://send?phone=<phone>&text=<encodedText>
    const nativeDesktopUrl = phone
      ? `whatsapp://send?phone=${phone}&text=${encodedText}`
      : `whatsapp://send?text=${encodedText}`;

    // Direct invocation: This tells macOS to open the native WhatsApp Desktop App immediately
    window.location.href = nativeDesktopUrl;

  } catch (err) {
    console.error('Failed to launch WhatsApp Desktop:', err);
  }
}
