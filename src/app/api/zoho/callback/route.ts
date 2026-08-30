import { NextRequest, NextResponse } from 'next/server';
import { getZohoConfig } from '@/lib/zoho/client';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/vendors?zoho_error=${encodeURIComponent(error || 'No authorization code returned')}`, req.url)
    );
  }

  const config = getZohoConfig();
  const host = req.headers.get('host') || 'localhost:3000';
  const protocol = req.headers.get('x-forwarded-proto') || 'http';
  const redirectUri = `${protocol}://${host}/api/zoho/callback`;

  try {
    const tokenUrl = `${config.accountsUrl}/oauth/v2/token`;
    const params = new URLSearchParams();
    params.append('code', code);
    params.append('client_id', config.clientId);
    params.append('client_secret', config.clientSecret);
    params.append('grant_type', 'authorization_code');
    params.append('redirect_uri', redirectUri);

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error || !tokenData.refresh_token) {
      console.error('Zoho token exchange failed:', tokenData);
      return NextResponse.redirect(
        new URL(`/vendors?zoho_error=${encodeURIComponent(tokenData.error || 'Failed to obtain refresh token. Please ensure prompt=consent was accepted.')}`, req.url)
      );
    }

    const refreshToken = tokenData.refresh_token;

    // Automatically update .env.local on server
    try {
      const envPath = path.join(process.cwd(), '.env.local');
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        if (envContent.includes('ZOHO_REFRESH_TOKEN=')) {
          envContent = envContent.replace(/ZOHO_REFRESH_TOKEN=.*/, `ZOHO_REFRESH_TOKEN=${refreshToken}`);
        } else {
          envContent += `\nZOHO_REFRESH_TOKEN=${refreshToken}\n`;
        }
        fs.writeFileSync(envPath, envContent, 'utf8');
      }
      process.env.ZOHO_REFRESH_TOKEN = refreshToken;
    } catch (fsErr) {
      console.error('Could not auto-write to .env.local:', fsErr);
    }

    return NextResponse.redirect(new URL('/vendors?zoho_connected=true', req.url));
  } catch (err: any) {
    console.error('Zoho OAuth Callback error:', err);
    return NextResponse.redirect(
      new URL(`/vendors?zoho_error=${encodeURIComponent(err.message || 'Unexpected OAuth error')}`, req.url)
    );
  }
}
