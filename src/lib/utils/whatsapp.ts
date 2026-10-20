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
 * Triggers WhatsApp directly for Mac Desktop app and Web
 * Opening https://wa.me/<phone>?text=... in the browser natively instructs macOS:
 * "Open WhatsApp.app?" which opens the EXACT conversation for that phone number in the Mac desktop client.
 */
export function openWhatsApp(params: WhatsAppPaymentParams): void {
  try {
    const phone = formatWhatsAppPhoneNumber(params.phoneNumber);
    const text = buildPaymentWhatsAppMessage(params);
    const encodedText = encodeURIComponent(text);

    // If phone number exists, wa.me is the most reliable way on macOS
    // to navigate directly to that contact's chat and prefill the message
    let url: string;
    if (phone) {
      url = `https://wa.me/${phone}?text=${encodedText}`;
    } else {
      url = `whatsapp://send?text=${encodedText}`;
    }

    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Failed to launch WhatsApp:', err);
  }
}
