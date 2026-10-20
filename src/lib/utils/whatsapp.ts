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
 * Supports Oman (+968) default if 8 digits without country code
 */
export function formatWhatsAppPhoneNumber(phone?: string | null): string {
  if (!phone) return '';
  // Remove non-numeric characters
  let cleaned = phone.replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  } else if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }

  // If standard Oman 8-digit mobile number starting with 7, 9, etc., add 968
  if (cleaned.length === 8 && (cleaned.startsWith('9') || cleaned.startsWith('7'))) {
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
 * Generates https://wa.me/ URL for direct WhatsApp web/app launch
 */
export function getWhatsAppShareUrl(params: WhatsAppPaymentParams): string {
  const phone = formatWhatsAppPhoneNumber(params.phoneNumber);
  const text = buildPaymentWhatsAppMessage(params);
  const encodedText = encodeURIComponent(text);

  if (phone) {
    return `https://wa.me/${phone}?text=${encodedText}`;
  }
  // If no phone is provided, open WhatsApp with prefilled text so user can select contact
  return `https://api.whatsapp.com/send?text=${encodedText}`;
}

/**
 * Triggers WhatsApp window open safely in modern browsers
 */
export function openWhatsApp(params: WhatsAppPaymentParams): void {
  try {
    const url = getWhatsAppShareUrl(params);
    // Create an anchor element to avoid popup blocker issues
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Failed to open WhatsApp link:', err);
  }
}
