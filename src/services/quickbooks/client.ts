import { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/config/env.js';
import { QboConnection } from '@/types/database.js';
import { decryptToken, encryptToken } from './crypto.js';
import { QboTokenResponse, refreshTokens } from './oauth.js';

const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

function getApiBaseUrl(): string {
  return env.QBO_ENV === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

function getExpiresAt(expiresInSeconds: number): string {
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

function isTokenExpiring(expiresAt: string): boolean {
  const expiry = new Date(expiresAt).getTime();
  return expiry - Date.now() <= EXPIRY_BUFFER_MS;
}

export async function getQboConnection(
  supabase: SupabaseClient,
  realmId: string
): Promise<QboConnection | null> {
  const { data, error } = await supabase
    .from('qbo_connections')
    .select('*')
    .eq('realm_id', realmId)
    .single();

  if (error) {
    return null;
  }

  return data as QboConnection;
}

export async function storeQboConnection(
  supabase: SupabaseClient,
  realmId: string,
  tokenResponse: QboTokenResponse
): Promise<QboConnection> {
  const expiresAt = getExpiresAt(tokenResponse.expires_in);
  const encryptedAccess = encryptToken(tokenResponse.access_token, env.QBO_TOKEN_ENCRYPTION_KEY);
  const encryptedRefresh = encryptToken(tokenResponse.refresh_token, env.QBO_TOKEN_ENCRYPTION_KEY);

  const { data, error } = await supabase
    .from('qbo_connections')
    .upsert(
      {
        realm_id: realmId,
        access_token_enc: encryptedAccess,
        refresh_token_enc: encryptedRefresh,
        expires_at: expiresAt,
        scope: 'com.intuit.quickbooks.accounting',
      },
      { onConflict: 'realm_id' }
    )
    .select()
    .single();

  if (error || !data) {
    throw new Error('Failed to persist QuickBooks connection');
  }

  return data as QboConnection;
}

export async function refreshQboConnection(
  supabase: SupabaseClient,
  connection: QboConnection
): Promise<QboConnection> {
  const refreshToken = decryptToken(connection.refresh_token_enc, env.QBO_TOKEN_ENCRYPTION_KEY);
  const refreshed = await refreshTokens(refreshToken);

  const updated = await storeQboConnection(supabase, connection.realm_id, {
    ...refreshed,
    refresh_token: refreshed.refresh_token ?? refreshToken,
  });

  return updated;
}

export async function getQboAccessToken(
  supabase: SupabaseClient,
  realmId: string
): Promise<{ accessToken: string; connection: QboConnection }>{
  const connection = await getQboConnection(supabase, realmId);

  if (!connection) {
    throw new Error('QuickBooks connection not found');
  }

  let activeConnection = connection;
  if (isTokenExpiring(connection.expires_at)) {
    activeConnection = await refreshQboConnection(supabase, connection);
  }

  const accessToken = decryptToken(activeConnection.access_token_enc, env.QBO_TOKEN_ENCRYPTION_KEY);

  return { accessToken, connection: activeConnection };
}

export async function fetchQboEntity(
  supabase: SupabaseClient,
  realmId: string,
  entity: string,
  entityId: string
): Promise<Record<string, unknown>> {
  const { accessToken } = await getQboAccessToken(supabase, realmId);
  const url = `${getApiBaseUrl()}/v3/company/${realmId}/${entity.toLowerCase()}/${entityId}?minorversion=${env.QBO_API_MINOR_VERSION}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`QuickBooks API error: ${response.status} ${errorBody}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

async function postQboEntity(
  supabase: SupabaseClient,
  realmId: string,
  entity: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { accessToken } = await getQboAccessToken(supabase, realmId);
  const url = `${getApiBaseUrl()}/v3/company/${realmId}/${entity.toLowerCase()}?minorversion=${env.QBO_API_MINOR_VERSION}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`QuickBooks API error: ${response.status} ${errorBody}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

export async function createQboCustomer(
  supabase: SupabaseClient,
  realmId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return postQboEntity(supabase, realmId, 'customer', payload);
}
