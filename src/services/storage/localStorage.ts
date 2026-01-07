import fs from 'fs/promises';
import path from 'path';
import { createReadStream, existsSync } from 'fs';
import { Readable } from 'stream';

export interface StorageProvider {
  /**
   * Upload a file to storage
   * @param file - The file buffer to upload
   * @param fileName - The unique file name
   * @returns The storage path where the file was saved
   */
  uploadFile(file: Buffer, fileName: string): Promise<string>;

  /**
   * Download a file from storage
   * @param storagePath - The storage path of the file
   * @returns A readable stream of the file or a signed URL
   */
  downloadFile(storagePath: string): Promise<Readable | string>;

  /**
   * Delete a file from storage
   * @param storagePath - The storage path of the file
   */
  deleteFile(storagePath: string): Promise<void>;

  /**
   * Check if a file exists in storage
   * @param storagePath - The storage path of the file
   */
  fileExists(storagePath: string): Promise<boolean>;
}

export class LocalStorageProvider implements StorageProvider {
  private readonly basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async uploadFile(file: Buffer, fileName: string): Promise<string> {
    // Ensure the base directory exists
    await fs.mkdir(this.basePath, { recursive: true });

    const filePath = path.join(this.basePath, fileName);
    await fs.writeFile(filePath, file);

    return fileName; // Return relative path as storage_path
  }

  downloadFile(storagePath: string): Promise<Readable> {
    const filePath = path.join(this.basePath, storagePath);
    
    // Check if file exists
    if (!existsSync(filePath)) {
      throw new Error('File not found');
    }

    return Promise.resolve(createReadStream(filePath));
  }

  async deleteFile(storagePath: string): Promise<void> {
    const filePath = path.join(this.basePath, storagePath);
    
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore error if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async fileExists(storagePath: string): Promise<boolean> {
    const filePath = path.join(this.basePath, storagePath);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
