import { NextResponse } from 'next/server';
import { getZohoConfig } from '@/lib/zoho/client';

export async function GET() {
  const config = getZohoConfig();
  const isConfigured = Boolean(config.clientId && config.clientSecret && config.refreshToken);

  return NextResponse.json({
    configured: isConfigured,
    organizationId: config.organizationId,
    hasClientId: Boolean(config.clientId),
    hasClientSecret: Boolean(config.clientSecret),
    hasRefreshToken: Boolean(config.refreshToken)
  });
}
