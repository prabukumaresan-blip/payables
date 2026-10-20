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
  const formattedDate = params.paymentDate
    ? format(parseISO(params.paymentDate), 'dd MMM yyyy')
    : format(new Date(), 'dd MMM yyyy');

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
