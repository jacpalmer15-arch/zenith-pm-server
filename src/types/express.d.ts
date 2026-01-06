import { AuthPayload, Employee } from './auth.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
      employee?: Employee;
    }
  }
}

export {};
