import { NextRequest, NextResponse } from 'next/server';
import { getZohoConfig, fetchZohoOrganizations } from '@/lib/zoho/client';

export async function GET(req: NextRequest) {
  const config = getZohoConfig();
  const isConfigured = Boolean(config.clientId && config.clientSecret && config.refreshToken);

  let organizations: any[] = [];
  if (isConfigured) {
    try {
      organizations = await fetchZohoOrganizations();
    } catch (e) {
      console.warn('Could not fetch organizations for status:', e);
    }
  }

  return NextResponse.json({
    configured: isConfigured,
    organizationId: config.organizationId,
    hasClientId: Boolean(config.clientId),
    hasClientSecret: Boolean(config.clientSecret),
    hasRefreshToken: Boolean(config.refreshToken),
    organizations: organizations
  });
}

