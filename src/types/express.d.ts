import { AuthPayload, Employee } from './auth.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
      employee?: Employee;
      rawBody?: string;
      requestId: string;
      correlationId: string;
    }
  }
}

export {};
