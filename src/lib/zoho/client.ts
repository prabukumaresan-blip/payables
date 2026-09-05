/**
 * Zoho Books API Integration Client
 * Supports token refreshing, fetching vendor balances, and retrieving unpaid bills.
 */

export interface ZohoTokenResponse {
  access_token: string;
  api_domain?: string;
  token_type: string;
  expires_in: number;
  error?: string;
}

export interface ZohoVendor {
  contact_id: string;
  contact_name: string;
  company_name: string;
  contact_type: string; // 'vendor'
  email?: string;
  phone?: string;
  currency_code?: string;
  outstanding_payable_amount: number; // In OMR (Base Currency)
  unused_credits_payable_amount: number; // In OMR (Base Currency)
  raw_outstanding_payable_amount?: number; // In Original Currency
  raw_unused_credits_payable_amount?: number; // In Original Currency
  bank_name?: string;
  bank_account_number?: string;
  swift_code?: string;
  status: string; // 'active'
}

export interface ZohoBill {
  bill_id: string;
  vendor_id: string;
  vendor_name: string;
  bill_number: string;
  date: string;
  due_date: string;
  status: 'paid' | 'open' | 'overdue' | 'partially_paid' | 'void';
  total: number; // In OMR (Base Currency)
  balance: number; // In OMR (Base Currency)
  raw_total?: number; // In Original Currency
  raw_balance?: number; // In Original Currency
  exchange_rate?: number;
  currency_code: string;
  reference_number?: string;
  notes?: string;
}

// In-memory access token cache
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

function readEnvFileFallback(): Record<string, string> {
  try {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const envVars: Record<string, string> = {};
      content.split('\n').forEach((line: string) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const match = trimmed.match(/^([^=]+)=(.*)$/);
          if (match) {
            const key = match[1].trim();
            const val = match[2].trim().replace(/^['"]|['"]$/g, '');
            envVars[key] = val;
          }
        }
      });
      return envVars;
    }
  } catch (e) {
    // Ignore errors in environments where fs is restricted
  }
  return {};
}

export function getZohoConfig() {
  const fallback = !process.env.ZOHO_CLIENT_ID ? readEnvFileFallback() : {};

  return {
    clientId: process.env.ZOHO_CLIENT_ID || fallback.ZOHO_CLIENT_ID || '',
    clientSecret: process.env.ZOHO_CLIENT_SECRET || fallback.ZOHO_CLIENT_SECRET || '',
    refreshToken: process.env.ZOHO_REFRESH_TOKEN || fallback.ZOHO_REFRESH_TOKEN || '',
    organizationId: process.env.ZOHO_ORGANIZATION_ID || fallback.ZOHO_ORGANIZATION_ID || '771750431',
    accountsUrl: process.env.ZOHO_ACCOUNTS_URL || fallback.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com',
    apiUrl: process.env.ZOHO_API_URL || fallback.ZOHO_API_URL || 'https://www.zohoapis.com/books/v3',
    redirectUri: process.env.ZOHO_REDIRECT_URI || fallback.ZOHO_REDIRECT_URI || ''
  };
}

export function getZohoRedirectUri(req?: { headers: { get: (name: string) => string | null } }): string {
  const config = getZohoConfig();
  if (config.redirectUri) {
    return config.redirectUri;
  }

  if (req) {
    const forwardedProto = req.headers.get('x-forwarded-proto');
    const forwardedHost = req.headers.get('x-forwarded-host');
    const host = forwardedHost || req.headers.get('host') || 'localhost:3000';
    const protocol = forwardedProto || (host.includes('localhost') ? 'http' : 'https');
    return `${protocol}://${host}/api/zoho/callback`;
  }

  return 'https://payables-olive.vercel.app/api/zoho/callback';
}

/**
 * Get a valid Zoho OAuth Access Token using Refresh Token
 */
export async function getZohoAccessToken(): Promise<string> {
  const config = getZohoConfig();
  
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    throw new Error(
      'Zoho credentials not fully configured. Please set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REFRESH_TOKEN in .env.local'
    );
  }

  const now = Date.now();
  // If we have a valid token that doesn't expire in next 60 seconds, reuse it
  if (cachedAccessToken && tokenExpiresAt > now + 60000) {
    return cachedAccessToken;
  }

  const url = `${config.accountsUrl}/oauth/v2/token?refresh_token=${encodeURIComponent(
    config.refreshToken
  )}&client_id=${encodeURIComponent(config.clientId)}&client_secret=${encodeURIComponent(
    config.clientSecret
  )}&grant_type=refresh_token`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh Zoho access token: ${response.status} ${errorText}`);
  }

  const data: ZohoTokenResponse = await response.json();
  if (data.error || !data.access_token) {
    throw new Error(`Zoho token error: ${data.error || 'No access token returned'}`);
  }

  cachedAccessToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in || 3600) * 1000;

  return cachedAccessToken;
}

export interface ZohoOrganization {
  organization_id: string;
  name: string;
  currency_code?: string;
  is_default_org?: boolean;
}

/**
 * Make an authenticated API request to Zoho Books
 */
export async function zohoRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: any,
  customOrgId?: string | null
): Promise<T> {
  const config = getZohoConfig();
  const token = await getZohoAccessToken();
  const orgId = customOrgId || config.organizationId;

  const separator = endpoint.includes('?') ? '&' : '?';
  // If endpoint is /organizations, organization_id is not required
  const orgQuery = endpoint.startsWith('/organizations') ? '' : `${separator}organization_id=${orgId}`;
  const url = `${config.apiUrl}${endpoint}${orgQuery}`;

  const headers: Record<string, string> = {
    Authorization: `Zoho-oauthtoken ${token}`,
    'Content-Type': 'application/json;charset=UTF-8'
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const json = await response.json();

  if (json.code !== 0 && !response.ok) {
    throw new Error(json.message || `Zoho API Error (${json.code || response.status})`);
  }

  return json as T;
}

/**
 * Fetch all Zoho Organizations accessible by the current token
 */
export async function fetchZohoOrganizations(): Promise<ZohoOrganization[]> {
  try {
    const res = await zohoRequest<{
      code: number;
      message: string;
      organizations: any[];
    }>('/organizations', 'GET');

    if (res.organizations && res.organizations.length > 0) {
      return res.organizations.map((org) => ({
        organization_id: String(org.organization_id),
        name: org.name || org.organization_name || '',
        currency_code: org.currency_code || 'OMR',
        is_default_org: Boolean(org.is_default_org)
      }));
    }
    return [];
  } catch (err) {
    console.warn('Could not fetch Zoho organizations list:', err);
    return [];
  }
}

/**
 * Fetch all Vendors from Zoho Books with their outstanding payable balances converted to OMR
 */
export async function fetchZohoVendors(organizationId?: string | null): Promise<ZohoVendor[]> {
  let allVendors: ZohoVendor[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const res = await zohoRequest<{
      code: number;
      message: string;
      contacts: any[];
      page_context?: { has_more_page: boolean; page: number };
    }>(`/contacts?contact_type=vendor&status=all&page=${page}&per_page=200`, 'GET', undefined, organizationId);

    if (res.contacts && res.contacts.length > 0) {
      const mapped: ZohoVendor[] = res.contacts.map((c) => {
        // Base currency (OMR) values from Zoho
        const outstandingOMR = c.outstanding_payable_amount_bcy !== undefined && c.outstanding_payable_amount_bcy !== null
          ? Number(c.outstanding_payable_amount_bcy)
          : Number(c.outstanding_payable_amount || 0);

        const unusedCreditsOMR = c.unused_credits_payable_amount_bcy !== undefined && c.unused_credits_payable_amount_bcy !== null
          ? Number(c.unused_credits_payable_amount_bcy)
          : Number(c.unused_credits_payable_amount || 0);

        return {
          contact_id: c.contact_id,
          contact_name: c.contact_name,
          company_name: c.company_name || c.contact_name,
          contact_type: c.contact_type,
          email: c.email || '',
          phone: c.phone || c.mobile || '',
          currency_code: c.currency_code || 'OMR',
          outstanding_payable_amount: Number(outstandingOMR.toFixed(3)),
          unused_credits_payable_amount: Number(unusedCreditsOMR.toFixed(3)),
          raw_outstanding_payable_amount: Number(c.outstanding_payable_amount || 0),
          raw_unused_credits_payable_amount: Number(c.unused_credits_payable_amount || 0),
          bank_name: c.bank_name || '',
          bank_account_number: c.bank_account_number || '',
          swift_code: c.swift_code || '',
          status: c.status
        };
      });

      allVendors.push(...mapped);
    }

    if (res.page_context?.has_more_page) {
      page++;
    } else {
      hasMore = false;
    }
  }

  return allVendors;
}

/**
 * Fetch all unpaid or partially paid Bills from Zoho Books converted to OMR
 */
export async function fetchZohoUnpaidBills(organizationId?: string | null): Promise<ZohoBill[]> {
  let allBills: ZohoBill[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    // Status can be 'open', 'overdue', 'partially_paid'
    const res = await zohoRequest<{
      code: number;
      message: string;
      bills: any[];
      page_context?: { has_more_page: boolean; page: number };
    }>(`/bills?status=unpaid&page=${page}&per_page=200`, 'GET', undefined, organizationId);

    if (res.bills && res.bills.length > 0) {
      const mapped: ZohoBill[] = res.bills.map((b) => {
        const exchangeRate = Number(b.exchange_rate) || 1;
        const totalOMR = b.bcy_total !== undefined && b.bcy_total !== null
          ? Number(b.bcy_total)
          : (b.currency_code === 'OMR' ? Number(b.total || 0) : Number((Number(b.total || 0) * exchangeRate).toFixed(3)));

        const balanceOMR = b.bcy_balance !== undefined && b.bcy_balance !== null
          ? Number(b.bcy_balance)
          : (b.currency_code === 'OMR' ? Number(b.balance || 0) : Number((Number(b.balance || 0) * exchangeRate).toFixed(3)));

        return {
          bill_id: b.bill_id,
          vendor_id: b.vendor_id,
          vendor_name: b.vendor_name,
          bill_number: b.bill_number,
          date: b.date,
          due_date: b.due_date,
          status: b.status,
          total: Number(totalOMR.toFixed(3)),
          balance: Number(balanceOMR.toFixed(3)),
          raw_total: Number(b.total || 0),
          raw_balance: Number(b.balance || 0),
          exchange_rate: exchangeRate,
          currency_code: b.currency_code || 'OMR',
          reference_number: b.reference_number || '',
          notes: b.notes || ''
        };
      });

      allBills.push(...mapped);
    }

    if (res.page_context?.has_more_page) {
      page++;
    } else {
      hasMore = false;
    }
  }

  return allBills;
}

export interface RecordZohoPaymentParams {
  vendorId: string;
  billId?: string | null;
  amount: number;
  paymentDate: string;
  referenceNo?: string | null;
  notes?: string | null;
  paymentMode?: string;
  paidThroughAccountId?: string;
  organizationId?: string | null;
}

export interface ZohoVendorPaymentResult {
  payment_id: string;
  payment_number?: string;
  amount: number;
  date: string;
  vendor_id: string;
  reference_number?: string;
}

/**
 * Record a vendor payment in Zoho Books.
 * If billId is provided, the payment is applied against the specific bill.
 * Otherwise, it creates an advance/excess payment for the vendor in Zoho Books.
 */
export async function recordZohoVendorPayment(
  params: RecordZohoPaymentParams
): Promise<ZohoVendorPaymentResult> {
  const payload: any = {
    vendor_id: params.vendorId,
    payment_mode: params.paymentMode || 'Bank Transfer',
    date: params.paymentDate,
    amount: Number(Number(params.amount).toFixed(3)),
    reference_number: params.referenceNo || undefined,
    description: params.notes || 'Payment recorded via Payables Tracker'
  };

  // Default paid_through_account_id to Bank Muscat Corporate Account if not explicitly passed
  payload.paid_through_account_id = params.paidThroughAccountId || '3095712000000075328';

  if (params.billId) {
    payload.bills = [
      {
        bill_id: params.billId,
        amount_applied: Number(Number(params.amount).toFixed(3))
      }
    ];
  }

  const res = await zohoRequest<{
    code: number;
    message: string;
    vendorpayment?: any;
    payment?: any;
  }>('/vendorpayments', 'POST', payload, params.organizationId);

  const paymentData = res.vendorpayment || res.payment || {};

  return {
    payment_id: paymentData.payment_id || paymentData.vendorpayment_id || '',
    payment_number: paymentData.payment_number || '',
    amount: Number(paymentData.amount || params.amount),
    date: paymentData.date || params.paymentDate,
    vendor_id: paymentData.vendor_id || params.vendorId,
    reference_number: paymentData.reference_number || params.referenceNo || undefined
  };
}

/**
 * Delete a vendor payment in Zoho Books
 */
export async function deleteZohoVendorPayment(paymentId: string, organizationId?: string | null): Promise<boolean> {
  if (!paymentId) return false;
  try {
    const res = await zohoRequest<{
      code: number;
      message: string;
    }>(`/vendorpayments/${paymentId}`, 'DELETE', undefined, organizationId);
    return res.code === 0;
  } catch (err: any) {
    console.error(`Failed to delete Zoho payment ${paymentId}:`, err);
    throw err;
  }
}

