import { createApp } from '../src/app.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const app = createApp();

export default function handler(req: VercelRequest, res: VercelResponse): void {
  // Forward the request to Express
  // Vercel handles the request/response objects in a compatible way
  app(req as never, res as never);
}
