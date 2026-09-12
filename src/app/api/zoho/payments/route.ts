import { NextRequest, NextResponse } from 'next/server';
import { 
  getZohoConfig, 
  recordZohoVendorPayment, 
  deleteZohoVendorPayment, 
  fetchZohoVendors,
  fetchZohoBankAccounts,
  recordZohoBankTransfer
} from '@/lib/zoho/client';
import { createClient as createSupabaseServerClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return createSupabaseServerClient(supabaseUrl, supabaseKey);
}

/**
 * POST /api/zoho/payments
 * Record a vendor payment in Zoho Books
 */
export async function POST(req: NextRequest) {
  try {
    const config = getZohoConfig();
    if (!config.clientId || !config.clientSecret || !config.refreshToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'Zoho Books credentials not configured. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REFRESH_TOKEN in .env.local'
        },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { payable_id, company_id, organization_id, vendor_name, amount, payment_date, reference_no, notes, zoho_contact_id, zoho_bill_id } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Payment amount must be greater than 0' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    let targetVendorContactId = zoho_contact_id || null;
    let targetBillId = zoho_bill_id || null;
    let targetVendorName = vendor_name || '';
    let targetOrgId = organization_id || null;
    let targetCategoryId = null;

    // If payable_id is provided and we don't have all Zoho details, look it up
    if (payable_id) {
      if (supabase) {
        const { data: payable } = await supabase
          .from('payables')
          .select('*')
          .eq('id', payable_id)
          .single();

        if (payable) {
          targetCategoryId = payable.category_id;
          if (!targetVendorName) targetVendorName = payable.vendor_name || payable.title;
          if (!targetBillId) {
            targetBillId = payable.zoho_bill_id || null;
            if (!targetBillId && payable.notes) {
              const match = payable.notes.match(/\[ZOHO_BILL:([a-zA-Z0-9_-]+)\]/);
              if (match) targetBillId = match[1];
            }
          }
          if (!targetOrgId && payable.company_id) {
            const { data: company, error: compErr } = await supabase
              .from('companies')
              .select('zoho_organization_id')
              .eq('id', payable.company_id)
              .single();
            if (compErr) {
              console.error('Failed to query companies table. Did you run the migration?:', compErr);
            }
            if (company?.zoho_organization_id) {
              targetOrgId = company.zoho_organization_id;
            }
          }
        }
      }
    }

    // If company_id was explicitly provided and we still don't have targetOrgId
    if (company_id && !targetOrgId && supabase) {
      const { data: company, error: compErr } = await supabase
        .from('companies')
        .select('zoho_organization_id')
        .eq('id', company_id)
        .single();
      if (compErr) {
        console.error('Failed to query companies table for company_id. Did you run the migration?:', compErr);
      }
      if (company?.zoho_organization_id) {
        targetOrgId = company.zoho_organization_id;
      }
    }

    // Default to config organization if still not resolved
    if (!targetOrgId) {
      targetOrgId = config.organizationId;
    }

    // Check if it's a petty cash payment (Category ID 'cat-5' or fallback to name check) that should be recorded as a bank transfer
    const isPettyCash = targetCategoryId === 'cat-5' || (!targetCategoryId && targetVendorName.toLowerCase().includes('petty cash'));
    
    if (isPettyCash) {
      try {
        const allBankAccounts = await fetchZohoBankAccounts(targetOrgId);
        const bankAccounts = allBankAccounts.filter(a => a.is_active);
        const rawSearch = targetVendorName.toLowerCase().trim();
        
        // 1. Exact Match
        let matchedAccount = bankAccounts.find(a => a.account_name.toLowerCase().trim() === rawSearch);
        
        // 2. Multi-Keyword Match (prioritize over loose substring)
        if (!matchedAccount) {
          const keywords = rawSearch.split(/\s+/).filter(k => k.length >= 3);
          if (keywords.length > 0) {
            matchedAccount = bankAccounts.find(a => {
              const accountName = a.account_name.toLowerCase();
              return keywords.every(k => accountName.includes(k));
            });
          }
        }

        // 3. Loose Substring Match
        if (!matchedAccount) {
          matchedAccount = bankAccounts.find(a => 
            a.account_name.toLowerCase().includes(rawSearch) ||
            rawSearch.includes(a.account_name.toLowerCase())
          );
        }
        
        if (!matchedAccount) {
          return NextResponse.json(
            { success: false, error: `No active matching Petty Cash bank account found for "${targetVendorName}". Please ensure a corresponding bank/cash account is created and active in Zoho Books.` },
            { status: 404 }
          );
        }

        const fromAccountId = '3095712000000075328'; // Default Bank Muscat Corporate
        const transfer = await recordZohoBankTransfer({
          fromAccountId,
          toAccountId: matchedAccount.account_id,
          amount: Number(amount),
          date: payment_date || new Date().toISOString().substring(0, 10),
          referenceNumber: reference_no || undefined,
          description: notes || `Petty cash transfer to ${targetVendorName}`,
          organizationId: targetOrgId
        });

        return NextResponse.json({
          success: true,
          data: {
            zoho_payment_id: transfer.transaction_id || transfer.banktransaction_id,
            payment_number: transfer.reference_number || `BT-${transfer.transaction_id || transfer.banktransaction_id || ''}`,
            amount: transfer.amount || amount,
            date: transfer.date || payment_date,
            bill_id: targetBillId,
            vendor_id: matchedAccount.account_id,
            organization_id: targetOrgId
          }
        });
      } catch (e: any) {
        console.warn('Could not process petty cash transfer:', e);
        return NextResponse.json(
          { success: false, error: e.message || 'Failed to record bank transfer in Zoho Books' },
          { status: 500 }
        );
      }
    }

    // If vendor contact ID is still not found, try matching by vendor name from Zoho vendors
    if (!targetVendorContactId && targetVendorName) {
      try {
        const zohoVendors = await fetchZohoVendors(targetOrgId);
        const rawSearch = targetVendorName.toLowerCase().trim();
        
        const normalize = (s: string) => (s || '')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, ' ')
          .replace(/\b(llc|l\.l\.c|trading|co|company|corp|corporation|transport|equipments|for|services|est|establishment)\b/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        const normSearch = normalize(targetVendorName);

        // 1. Exact match
        let matchedZv = zohoVendors.find(
          zv =>
            zv.contact_name.toLowerCase().trim() === rawSearch ||
            (zv.company_name && zv.company_name.toLowerCase().trim() === rawSearch)
        );

        // 2. Direct substring match
        if (!matchedZv) {
          matchedZv = zohoVendors.find(
            zv =>
              zv.contact_name.toLowerCase().trim().includes(rawSearch) ||
              (zv.company_name && zv.company_name.toLowerCase().trim().includes(rawSearch)) ||
              rawSearch.includes(zv.contact_name.toLowerCase().trim()) ||
              (zv.company_name && rawSearch.includes(zv.company_name.toLowerCase().trim()))
          );
        }

        // 3. Normalized token matching
        if (!matchedZv && normSearch.length >= 3) {
          matchedZv = zohoVendors.find(zv => {
            const cNorm = normalize(zv.contact_name);
            const compNorm = normalize(zv.company_name);
            return (cNorm && (cNorm === normSearch || cNorm.includes(normSearch) || normSearch.includes(cNorm))) ||
                   (compNorm && (compNorm === normSearch || compNorm.includes(normSearch) || normSearch.includes(compNorm)));
          });
        }

        // 3. Significant keyword matching
        if (!matchedZv) {
          const keywords = normSearch.split(/\s+/).filter(k => k.length >= 4);
          if (keywords.length > 0) {
            matchedZv = zohoVendors.find(zv => {
              const cNorm = normalize(zv.contact_name);
              const compNorm = normalize(zv.company_name);
              return keywords.every(k => cNorm.includes(k) || compNorm.includes(k));
            });
          }
        }

        if (matchedZv) {
          targetVendorContactId = matchedZv.contact_id;
        }
      } catch (e) {
        console.warn('Could not search Zoho vendors by name:', e);
      }
    }

    if (!targetVendorContactId) {
      return NextResponse.json(
        {
          success: false,
          error: `No linked Zoho Contact found for vendor "${targetVendorName || 'Unknown'}". Please map this vendor with Zoho Books first.`
        },
        { status: 404 }
      );
    }

    // Record vendor payment in Zoho Books
    const zohoPayment = await recordZohoVendorPayment({
      vendorId: targetVendorContactId,
      billId: targetBillId,
      amount: Number(amount),
      paymentDate: payment_date || new Date().toISOString().substring(0, 10),
      referenceNo: reference_no || undefined,
      notes: notes || `Payment recorded for ${targetVendorName}`,
      organizationId: targetOrgId
    });

    return NextResponse.json({
      success: true,
      data: {
        zoho_payment_id: zohoPayment.payment_id,
        payment_number: zohoPayment.payment_number,
        amount: zohoPayment.amount,
        date: zohoPayment.date,
        bill_id: targetBillId,
        vendor_id: targetVendorContactId,
        organization_id: targetOrgId
      }
    });
  } catch (error: any) {
    console.error('Error recording Zoho payment:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to record vendor payment in Zoho Books'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/zoho/payments
 * Delete a vendor payment in Zoho Books
 */
export async function DELETE(req: NextRequest) {
  try {
    const config = getZohoConfig();
    if (!config.clientId || !config.clientSecret || !config.refreshToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'Zoho Books credentials not configured.'
        },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const paymentId = searchParams.get('payment_id');
    const orgId = searchParams.get('organization_id') || config.organizationId;

    if (!paymentId) {
      return NextResponse.json(
        { success: false, error: 'payment_id query parameter is required' },
        { status: 400 }
      );
    }

    await deleteZohoVendorPayment(paymentId, orgId);

    return NextResponse.json({
      success: true,
      message: `Zoho Payment ${paymentId} deleted successfully`
    });
  } catch (error: any) {
    console.error('Error deleting Zoho payment:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to delete vendor payment from Zoho Books'
      },
      { status: 500 }
    );
  }
}

