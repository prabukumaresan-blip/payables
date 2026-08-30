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
  outstanding_payable_amount: number;
  unused_credits_payable_amount: number;
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
  total: number;
  balance: number;
  currency_code: string;
  reference_number?: string;
  notes?: string;
}

// In-memory access token cache
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

export function getZohoConfig() {
  return {
    clientId: process.env.ZOHO_CLIENT_ID || '',
    clientSecret: process.env.ZOHO_CLIENT_SECRET || '',
    refreshToken: process.env.ZOHO_REFRESH_TOKEN || '',
    organizationId: process.env.ZOHO_ORGANIZATION_ID || '771750431',
    accountsUrl: process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com',
    apiUrl: process.env.ZOHO_API_URL || 'https://www.zohoapis.com/books/v3'
  };
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

/**
 * Make an authenticated API request to Zoho Books
 */
export async function zohoRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: any
): Promise<T> {
  const config = getZohoConfig();
  const token = await getZohoAccessToken();

  const separator = endpoint.includes('?') ? '&' : '?';
  const url = `${config.apiUrl}${endpoint}${separator}organization_id=${config.organizationId}`;

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
 * Fetch all Vendors from Zoho Books with their outstanding payable balances
 */
export async function fetchZohoVendors(): Promise<ZohoVendor[]> {
  let allVendors: ZohoVendor[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const res = await zohoRequest<{
      code: number;
      message: string;
      contacts: any[];
      page_context?: { has_more_page: boolean; page: number };
    }>(`/contacts?contact_type=vendor&status=all&page=${page}&per_page=200`);

    if (res.contacts && res.contacts.length > 0) {
      const mapped: ZohoVendor[] = res.contacts.map((c) => ({
        contact_id: c.contact_id,
        contact_name: c.contact_name,
        company_name: c.company_name || c.contact_name,
        contact_type: c.contact_type,
        email: c.email || '',
        phone: c.phone || c.mobile || '',
        outstanding_payable_amount: Number(c.outstanding_payable_amount || 0),
        unused_credits_payable_amount: Number(c.unused_credits_payable_amount || 0),
        bank_name: c.bank_name || '',
        bank_account_number: c.bank_account_number || '',
        swift_code: c.swift_code || '',
        status: c.status
      }));

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
 * Fetch all unpaid or partially paid Bills from Zoho Books
 */
export async function fetchZohoUnpaidBills(): Promise<ZohoBill[]> {
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
    }>(`/bills?status=unpaid&page=${page}&per_page=200`);

    if (res.bills && res.bills.length > 0) {
      const mapped: ZohoBill[] = res.bills.map((b) => ({
        bill_id: b.bill_id,
        vendor_id: b.vendor_id,
        vendor_name: b.vendor_name,
        bill_number: b.bill_number,
        date: b.date,
        due_date: b.due_date,
        status: b.status,
        total: Number(b.total || 0),
        balance: Number(b.balance || 0),
        currency_code: b.currency_code || 'OMR',
        reference_number: b.reference_number || '',
        notes: b.notes || ''
      }));

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
