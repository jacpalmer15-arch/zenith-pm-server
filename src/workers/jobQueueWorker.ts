import { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/db/client.js';
import { env } from '@/config/env.js';
import { processTimeCostPost } from './processors/timeCostPost.js';
import { processQboWebhookEvent } from './processors/qboWebhook.js';
import { processQboPushCustomer, processQboPushProject } from './processors/qboPush.js';
import { processPmAppWebhook } from './processors/pmAppWebhook.js';
import { randomUUID } from 'crypto';
import os from 'os';

interface JobQueueEntry {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  max_attempts?: number;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
}

const MAX_ATTEMPTS = 3;

/**
 * Job Queue Worker
 * Polls the job_queue table for pending jobs and processes them
 */
export class JobQueueWorker {
  private supabase: SupabaseClient;
  private workerId: string;
  private pollIntervalMs: number;
  private batchSize: number;
  private isRunning: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.supabase = createServerClient();
    this.workerId = env.WORKER_ID ?? `${os.hostname()}-${randomUUID()}`;
    this.pollIntervalMs = env.WORKER_POLL_INTERVAL_MS;
    this.batchSize = env.WORKER_BATCH_SIZE;
  }

  /**
   * Start the worker
   */
  start(): void {
    if (this.isRunning) {
      console.log('Worker is already running');
      return;
    }

    this.isRunning = true;
    console.log(`Worker started: ${this.workerId}`);
    console.log(`Polling interval: ${this.pollIntervalMs}ms`);
    console.log(`Batch size: ${this.batchSize}`);

    // Start polling
    void this.poll();
  }

  /**
   * Stop the worker
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    console.log('Worker stopped');
  }

  /**
   * Poll for pending jobs
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      await this.processPendingJobs();
    } catch (error) {
      console.error('Error during polling:', error);
    }

    // Schedule next poll
    this.pollTimer = setTimeout(() => {
      void this.poll();
    }, this.pollIntervalMs);
  }

  /**
   * Process pending jobs
   */
  private async processPendingJobs(): Promise<void> {
    // Query for pending jobs
    const { data: jobs, error } = await this.supabase
      .from('job_queue')
      .select('*')
      .eq('status', 'PENDING')
      .lte('run_after', new Date().toISOString())
      .is('locked_at', null)
      .order('created_at', { ascending: true })
      .limit(this.batchSize);

    if (error) {
      console.error('Error fetching jobs:', error);
      return;
    }

    if (!jobs || jobs.length === 0) {
      return;
    }

    console.log(`Found ${jobs.length} pending job(s)`);

    // Process each job
    for (const job of jobs) {
      await this.processJob(job as JobQueueEntry);
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: JobQueueEntry): Promise<void> {
    // Lock the job
    const locked = await this.lockJob(job.id);
    if (!locked) {
      console.log(`Failed to lock job ${job.id}, skipping`);
      return;
    }

    console.log(`Processing job ${job.id} (type: ${job.job_type}, attempt: ${job.attempts + 1})`);

    try {
      // Route to appropriate processor
      await this.routeJob(job);

      // Mark job as completed
      await this.completeJob(job.id);
      console.log(`Job ${job.id} completed successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Job ${job.id} failed:`, errorMessage);

      // Handle job failure
      await this.handleJobFailure(job, errorMessage);
    }
  }

  /**
   * Lock a job for processing
   * Returns true if successfully locked, false if already locked by another worker
   */
  private async lockJob(jobId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('job_queue')
      .update({
        locked_at: new Date().toISOString(),
        locked_by: this.workerId,
      })
      .eq('id', jobId)
      .is('locked_at', null)
      .select();

    // Check if we successfully locked the job by verifying data was returned
    return !error && data && data.length > 0;
  }

  /**
   * Route job to appropriate processor
   */
  private async routeJob(job: JobQueueEntry): Promise<void> {
    switch (job.job_type) {
      case 'time_entry_cost_post':
        await processTimeCostPost(this.supabase, job.payload);
        break;
      case 'process_qbo_webhook_event':
        await processQboWebhookEvent(this.supabase, job.payload);
        break;
      case 'qbo_push_customer':
        await processQboPushCustomer(this.supabase, job.payload);
        break;
      case 'qbo_push_project':
        await processQboPushProject(this.supabase, job.payload);
        break;
      case 'process_pm_app_webhook':
        await processPmAppWebhook(this.supabase, job.payload);
        break;
      default:
        throw new Error(`Unknown job type: ${job.job_type}`);
    }
  }

  /**
   * Mark job as completed
   */
  private async completeJob(jobId: string): Promise<void> {
    await this.supabase
      .from('job_queue')
      .update({
        status: 'COMPLETED',
        last_error: null,
      })
      .eq('id', jobId);
  }

  /**
   * Handle job failure
   */
  private async handleJobFailure(job: JobQueueEntry, errorMessage: string): Promise<void> {
    const newAttempts = job.attempts + 1;
    const maxAttempts = job.max_attempts ?? MAX_ATTEMPTS;

    if (newAttempts >= maxAttempts) {
      // Mark as failed
      await this.supabase
        .from('job_queue')
        .update({
          status: 'FAILED',
          attempts: newAttempts,
          last_error: errorMessage,
          locked_at: null,
          locked_by: null,
        })
        .eq('id', job.id);
      console.log(`Job ${job.id} marked as FAILED after ${newAttempts} attempts`);
    } else {
      // Increment attempts and unlock for retry
      await this.supabase
        .from('job_queue')
        .update({
          attempts: newAttempts,
          last_error: errorMessage,
          locked_at: null,
          locked_by: null,
        })
        .eq('id', job.id);
      console.log(`Job ${job.id} will be retried (attempt ${newAttempts}/${maxAttempts})`);
    }
  }
}
