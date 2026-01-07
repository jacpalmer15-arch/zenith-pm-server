import multer from 'multer';
import { env } from '@/config/env.js';
import { isAllowedMimeType } from '@/validations/file.js';

// Configure multer to use memory storage
const storage = multer.memoryStorage();

// File filter to validate MIME types
const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (isAllowedMimeType(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}. Only images, PDFs, and documents are allowed.`));
  }
};

// Create multer instance with configuration
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.STORAGE_MAX_FILE_SIZE,
  },
});

// Single file upload middleware
export const uploadSingle = upload.single('file');

// Multiple files upload middleware (up to 10 files)
export const uploadMultiple = upload.array('files', 10);
