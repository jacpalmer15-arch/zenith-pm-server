import { SupabaseClient } from '@supabase/supabase-js';

export interface JobQueueEntry {
  id?: string;
  job_type: string;
  payload: Record<string, unknown>;
  status?: string;
  attempts?: number;
  run_after?: string;
  locked_at?: string | null;
  locked_by?: string | null;
  last_error?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Enqueue a job into the job_queue table
 * Checks for idempotency to prevent duplicate jobs
 * 
 * @param supabase - Supabase client instance
 * @param jobType - Type of job to enqueue
 * @param payload - Job payload data
 * @returns The created job entry or null if a duplicate already exists
 */
export async function enqueueJob(
  supabase: SupabaseClient,
  jobType: string,
  payload: Record<string, unknown>
): Promise<{ data: JobQueueEntry | null; error: unknown }> {
  try {
    // Check for existing PENDING job with same job_type and payload
    // For time_entry_cost_post, we check for matching time_entry_id in payload
    const { data: existingJobs, error: checkError } = await supabase
      .from('job_queue')
      .select('*')
      .eq('job_type', jobType)
      .eq('status', 'PENDING')
      .contains('payload', payload);

    if (checkError) {
      return { data: null, error: checkError };
    }

    // If a matching job already exists, return null (idempotency)
    if (existingJobs && existingJobs.length > 0) {
      return { data: null, error: null };
    }

    // Insert new job
    const { data, error } = await supabase
      .from('job_queue')
      .insert({
        job_type: jobType,
        payload,
        status: 'PENDING',
        run_after: new Date().toISOString(),
      })
      .select()
      .single<JobQueueEntry>();

    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
}
