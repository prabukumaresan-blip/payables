import { NextRequest, NextResponse } from 'next/server';
import { getZohoConfig, getZohoRedirectUri } from '@/lib/zoho/client';

export async function GET(req: NextRequest) {
  const config = getZohoConfig();
  const redirectUri = getZohoRedirectUri(req);

  if (!config.clientId) {
    return NextResponse.redirect(
      new URL(
        '/vendors?zoho_error=' +
          encodeURIComponent(
            'Zoho Client ID is not configured. Please add ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, and ZOHO_ORGANIZATION_ID to your environment variables (Vercel Settings / .env.local).'
          ),
        req.url
      )
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
