import { NextRequest, NextResponse } from 'next/server';
import { 
  getZohoConfig, 
  recordZohoVendorPayment, 
  deleteZohoVendorPayment, 
  fetchZohoVendors 
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
    const { payable_id, vendor_name, amount, payment_date, reference_no, notes, zoho_contact_id, zoho_bill_id } = body;

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

    // If payable_id is provided and we don't have all Zoho details, look it up
    if (payable_id && (!targetVendorContactId || !targetBillId)) {
      if (supabase) {
        const { data: payable } = await supabase
          .from('payables')
          .select('*')
          .eq('id', payable_id)
          .single();

        if (payable) {
          if (!targetVendorName) targetVendorName = payable.vendor_name || payable.title;
          if (!targetBillId) {
            targetBillId = payable.zoho_bill_id || null;
            if (!targetBillId && payable.notes) {
              const match = payable.notes.match(/\[ZOHO_BILL:([a-zA-Z0-9_-]+)\]/);
              if (match) targetBillId = match[1];
            }
          }
        }
      }
    }

    // If vendor contact ID is still not found, try matching by vendor name from Zoho vendors
    if (!targetVendorContactId && targetVendorName) {
      try {
        const zohoVendors = await fetchZohoVendors();
        const searchName = targetVendorName.toLowerCase().trim();
        const matchedZv = zohoVendors.find(
          zv =>
            zv.contact_name.toLowerCase().trim() === searchName ||
            (zv.company_name && zv.company_name.toLowerCase().trim() === searchName) ||
            zv.contact_name.toLowerCase().trim().includes(searchName) ||
            (zv.company_name && zv.company_name.toLowerCase().trim().includes(searchName)) ||
            searchName.includes(zv.contact_name.toLowerCase().trim())
        );
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
      notes: notes || `Payment recorded for ${targetVendorName}`
    });

    return NextResponse.json({
      success: true,
      data: {
        zoho_payment_id: zohoPayment.payment_id,
        payment_number: zohoPayment.payment_number,
        amount: zohoPayment.amount,
        date: zohoPayment.date,
        bill_id: targetBillId,
        vendor_id: targetVendorContactId
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

    if (!paymentId) {
      return NextResponse.json(
        { success: false, error: 'payment_id query parameter is required' },
        { status: 400 }
      );
    }

    await deleteZohoVendorPayment(paymentId);

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
