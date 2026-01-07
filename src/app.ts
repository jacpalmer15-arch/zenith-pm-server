import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import { env } from '@/config/env.js';
import { requestIdMiddleware } from '@/middleware/requestId.js';
import { notFoundHandler } from '@/middleware/notFound.js';
import { errorHandler } from '@/middleware/errorHandler.js';
import healthRouter from '@/routes/health.js';
import meRouter from '@/routes/me.js';
import customersRouter from '@/routes/customers.js';
import locationsRouter from '@/routes/locations.js';
import projectsRouter from '@/routes/projects.js';
import workOrdersRouter from '@/routes/workOrders.js';
import scheduleRouter from '@/routes/schedule.js';
import timeEntriesRouter from '@/routes/timeEntries.js';
import quotesRouter from '@/routes/quotes.js';
import quoteLinesRouter from '@/routes/quoteLines.js';
import receiptsRouter from '@/routes/receipts.js';
import receiptLinesRouter from '@/routes/receiptLines.js';
import invoicesRouter from '@/routes/invoices.js';
import invoiceLinesRouter from '@/routes/invoiceLines.js';
import partsRouter from '@/routes/parts.js';
import inventoryLedgerRouter from '@/routes/inventoryLedger.js';
import changeOrdersRouter from '@/routes/changeOrders.js';
import adminJobsRouter from '@/routes/admin/jobs.js';

export function createApp(): Express {
  const app = express();

  // Create Pino logger
  const logger = pino({
    level: env.LOG_LEVEL,
  });

  // Middleware stack
  app.use(helmet()); // Security headers
  app.use(cors()); // CORS with default settings
  app.use(express.json({ limit: '1mb' })); // JSON body parser with 1MB limit
  app.use(requestIdMiddleware); // Request ID and correlation ID
  
  // Simple request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info({
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        requestId: req.requestId,
        correlationId: req.correlationId,
        duration,
      });
    });
    
    next();
  });

  // Routes
  app.use(healthRouter);
  app.use(meRouter);
  app.use(customersRouter);
  app.use(locationsRouter);
  app.use(projectsRouter);
  app.use(workOrdersRouter);
  app.use(scheduleRouter);
  app.use(timeEntriesRouter);
  app.use(quotesRouter);
  app.use(quoteLinesRouter);
  app.use(receiptsRouter);
  app.use(receiptLinesRouter);
  app.use(invoicesRouter);
  app.use(invoiceLinesRouter);
  app.use(partsRouter);
  app.use(inventoryLedgerRouter);
  app.use(changeOrdersRouter);
  app.use(adminJobsRouter);

  // 404 handler - must come after all routes
  app.use(notFoundHandler);

  // Error handler - must be last
  app.use(errorHandler);

  return app;
}
