import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageProvider } from './localStorage.js';

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(region: string, accessKeyId: string, secretAccessKey: string, bucket: string) {
    this.client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    this.bucket = bucket;
  }

  async uploadFile(file: Buffer, fileName: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileName,
      Body: file,
    });

    await this.client.send(command);
    return fileName; // Return S3 key as storage_path
  }

  async downloadFile(storagePath: string): Promise<string> {
    // For S3, return a presigned URL instead of streaming
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storagePath,
    });

    // Generate presigned URL that expires in 15 minutes
    const url = await getSignedUrl(this.client, command, { expiresIn: 900 });
    return url;
  }

  async deleteFile(storagePath: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: storagePath,
    });

    await this.client.send(command);
  }

  async fileExists(storagePath: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: storagePath,
      });
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }
}
