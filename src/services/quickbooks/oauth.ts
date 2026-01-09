import { randomUUID } from 'crypto';
import { env } from '@/config/env.js';

export interface QboTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
  token_type: string;
  realmId?: string;
}

const AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const DEFAULT_SCOPES = ['com.intuit.quickbooks.accounting'];

export function buildQboAuthUrl(state?: string, scopes: string[] = DEFAULT_SCOPES): {
  url: string;
  state: string;
} {
  const resolvedState = state ?? randomUUID();
  const params = new URLSearchParams({
    client_id: env.QBO_CLIENT_ID,
    response_type: 'code',
    scope: scopes.join(' '),
    redirect_uri: env.QBO_REDIRECT_URI,
    state: resolvedState,
  });

  return {
    url: `${AUTH_URL}?${params.toString()}`,
    state: resolvedState,
  };
}

export async function exchangeCodeForTokens(code: string): Promise<QboTokenResponse> {
  const authHeader = Buffer.from(`${env.QBO_CLIENT_ID}:${env.QBO_CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.QBO_REDIRECT_URI,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`QuickBooks token exchange failed: ${response.status} ${errorBody}`);
  }

  return (await response.json()) as QboTokenResponse;
}

export async function refreshTokens(refreshToken: string): Promise<QboTokenResponse> {
  const authHeader = Buffer.from(`${env.QBO_CLIENT_ID}:${env.QBO_CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`QuickBooks token refresh failed: ${response.status} ${errorBody}`);
  }

  return (await response.json()) as QboTokenResponse;
}
