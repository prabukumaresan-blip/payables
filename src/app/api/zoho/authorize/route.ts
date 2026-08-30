import { NextRequest, NextResponse } from 'next/server';
import { getZohoConfig, getZohoRedirectUri } from '@/lib/zoho/client';

export async function GET(req: NextRequest) {
  const config = getZohoConfig();
  const redirectUri = getZohoRedirectUri(req);

  if (!config.clientId) {
    return NextResponse.json(
      { error: 'ZOHO_CLIENT_ID is not set in .env.local' },
      { status: 400 }
    );
  }

  const scope = encodeURIComponent('ZohoBooks.fullaccess.all');
  const authUrl = `${config.accountsUrl}/oauth/v2/auth?scope=${scope}&client_id=${encodeURIComponent(
    config.clientId
  )}&response_type=code&access_type=offline&prompt=consent&redirect_uri=${encodeURIComponent(
    redirectUri
  )}`;

  return NextResponse.redirect(authUrl);
}
