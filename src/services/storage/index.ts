import { env } from '@/config/env.js';
import { LocalStorageProvider, StorageProvider } from './localStorage.js';
import { S3StorageProvider } from './s3Storage.js';

let storageProviderInstance: StorageProvider | null = null;

/**
 * Get the configured storage provider (singleton)
 */
export function getStorageProvider(): StorageProvider {
  if (storageProviderInstance) {
    return storageProviderInstance;
  }

  if (env.STORAGE_PROVIDER === 's3') {
    // Validate required S3 configuration
    if (!env.AWS_REGION || !env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.AWS_S3_BUCKET) {
      throw new Error(
        'S3 storage provider requires AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET environment variables'
      );
    }

    storageProviderInstance = new S3StorageProvider(
      env.AWS_REGION,
      env.AWS_ACCESS_KEY_ID,
      env.AWS_SECRET_ACCESS_KEY,
      env.AWS_S3_BUCKET
    );
  } else {
    storageProviderInstance = new LocalStorageProvider(env.STORAGE_LOCAL_PATH);
  }

  return storageProviderInstance;
}

/**
 * Reset the storage provider instance (useful for testing)
 */
export function resetStorageProvider(): void {
  storageProviderInstance = null;
}
