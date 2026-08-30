import { NextRequest, NextResponse } from 'next/server';
import { fetchZohoVendors, fetchZohoUnpaidBills, getZohoConfig } from '@/lib/zoho/client';
import { createClient as createSupabaseServerClient } from '@supabase/supabase-js';
import { format } from 'date-fns';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return createSupabaseServerClient(supabaseUrl, supabaseKey);
}

export async function POST(req: NextRequest) {
  try {
    const config = getZohoConfig();
    if (!config.clientId || !config.clientSecret || !config.refreshToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'Zoho Books credentials not configured. Please set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REFRESH_TOKEN in .env.local'
        },
        { status: 400 }
      );
    }

    // 1. Fetch live Zoho Vendors & Balances
    const zohoVendors = await fetchZohoVendors();

    // 2. Fetch live Zoho Unpaid Bills
    const zohoBills = await fetchZohoUnpaidBills();

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    let updatedVendorsCount = 0;
    let createdVendorsCount = 0;
    let syncedBillsCount = 0;
    let vendorsToUpsert: any[] = [];
    let payablesToUpsert: any[] = [];

    const vendorSyncResults: any[] = [];

    if (supabase) {
      // 3. Fetch existing Supabase vendors
      const { data: existingVendors, error: vendorFetchError } = await supabase
        .from('vendors')
        .select('*');

      if (vendorFetchError) {
        throw new Error(`Failed to fetch vendors from Supabase: ${vendorFetchError.message}`);
      }

      const existingVendorsList = existingVendors || [];

      // 4. Batch Prepare Vendors for Upsert
      vendorsToUpsert = zohoVendors.map((zv) => {
        const zvName = (zv.company_name || zv.contact_name || '').trim();
        const match = existingVendorsList.find(
          (v: any) =>
            v.zoho_contact_id === zv.contact_id ||
            v.name.toLowerCase().trim() === zvName.toLowerCase()
        );

        if (match) {
          return {
            id: match.id,
            name: match.name,
            contact_person: match.contact_person || (zv.contact_name !== zvName ? zv.contact_name : null),
            email: match.email || zv.email || null,
            phone: match.phone || zv.phone || null,
            bank_name: match.bank_name || zv.bank_name || null,
            account_no: match.account_no || zv.bank_account_number || null,
            swift_code: match.swift_code || zv.swift_code || null,
            bank_type: match.bank_type || 'BANK_MUSCAT',
            bank_account: match.bank_account || (zv.bank_name && zv.bank_account_number ? `${zv.bank_name} - ${zv.bank_account_number}` : null),
            zoho_contact_id: zv.contact_id,
            outstanding_payable_amount: zv.outstanding_payable_amount,
            unused_credits_payable_amount: zv.unused_credits_payable_amount,
            zoho_last_synced_at: now,
            created_at: match.created_at || now
          };
        } else {
          return {
            id: crypto.randomUUID(),
            name: zvName,
            contact_person: zv.contact_name !== zvName ? zv.contact_name : null,
            email: zv.email || null,
            phone: zv.phone || null,
            bank_name: zv.bank_name || null,
            account_no: zv.bank_account_number || null,
            swift_code: zv.swift_code || null,
            bank_type: 'BANK_MUSCAT',
            bank_account: zv.bank_name && zv.bank_account_number ? `${zv.bank_name} - ${zv.bank_account_number}` : null,
            zoho_contact_id: zv.contact_id,
            outstanding_payable_amount: zv.outstanding_payable_amount,
            unused_credits_payable_amount: zv.unused_credits_payable_amount,
            zoho_last_synced_at: now,
            created_at: now
          };
        }
      }).filter(v => Boolean(v.name));

      // Batch Upsert Vendors in chunks of 100
      for (let i = 0; i < vendorsToUpsert.length; i += 100) {
        const chunk = vendorsToUpsert.slice(i, i + 100);
        const { error: upsertErr } = await supabase.from('vendors').upsert(chunk, { onConflict: 'id' });
        if (upsertErr) {
          console.error('Vendor batch upsert error:', upsertErr);
        }
      }
      updatedVendorsCount = vendorsToUpsert.length;

      // 5. Fetch existing Payables for matching
      const { data: existingPayablesData } = await supabase
        .from('payables')
        .select('*');
      const existingPayablesList = existingPayablesData || [];

      // Batch Prepare Bills for Upsert
      payablesToUpsert = zohoBills
        .filter((bill) => bill.bill_id && bill.balance > 0)
        .map((bill) => {
          const dueDateStr = bill.due_date || bill.date || format(new Date(), 'yyyy-MM-dd');
          const monthYear = dueDateStr.substring(0, 7);
          
          // Match by reference_no (bill_number) + vendor_name OR notes containing bill_id
          const match = existingPayablesList.find((p: any) => 
            (p.zoho_bill_id && p.zoho_bill_id === bill.bill_id) ||
            (p.notes && p.notes.includes(`[ZOHO_BILL:${bill.bill_id}]`)) ||
            (p.reference_no && p.reference_no.trim() === bill.bill_number.trim() && p.vendor_name?.toLowerCase().trim() === bill.vendor_name.toLowerCase().trim())
          );

          const notesTag = `[ZOHO_BILL:${bill.bill_id}] ${bill.notes || `Imported from Zoho Books Bill #${bill.bill_number}`}`;

          const item: any = {
            id: match ? match.id : crypto.randomUUID(),
            title: `Bill #${bill.bill_number} - ${bill.vendor_name}`,
            category_id: 'cat-1', // Vendor Payment
            vendor_name: bill.vendor_name,
            amount: bill.balance,
            currency: bill.currency_code || 'OMR',
            due_date: dueDateStr,
            month_year: monthYear,
            status: 'pending',
            paid_amount: 0,
            recurrence: 'once',
            reference_no: bill.bill_number,
            notes: notesTag,
            created_at: match?.created_at || now,
            updated_at: now
          };

          return item;
        });

      // Batch Upsert Payables in chunks of 100
      for (let i = 0; i < payablesToUpsert.length; i += 100) {
        const chunk = payablesToUpsert.slice(i, i + 100);
        const { error: pUpsertErr } = await supabase.from('payables').upsert(chunk, { onConflict: 'id' });
        if (pUpsertErr) {
          console.error('Payables batch upsert error:', pUpsertErr);
        }
      }
      syncedBillsCount = payablesToUpsert.length;
    }

    return NextResponse.json({
      success: true,
      data: {
        organizationId: config.organizationId,
        totalZohoVendors: zohoVendors.length,
        totalZohoBills: zohoBills.length,
        updatedVendorsCount,
        createdVendorsCount,
        syncedBillsCount,
        syncedAt: now,
        vendors: vendorsToUpsert,
        payables: payablesToUpsert
      }
    });
  } catch (error: any) {
    console.error('Zoho sync error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'An error occurred while syncing with Zoho Books'
      },
      { status: 500 }
    );
  }
}
