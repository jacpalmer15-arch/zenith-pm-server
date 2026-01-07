# Background Job Queue Worker - Manual Testing Guide

## Prerequisites

1. Ensure you have a Supabase project set up with the required tables
2. Environment variables configured in `.env`
3. Database tables: `job_queue`, `work_order_time_entries`, `employees`, `settings`, `cost_types`, `cost_codes`, `job_cost_entries`, `work_orders`

## Step 1: Start the Worker

In a terminal window:

```bash
npm run worker
```

Expected output:
```
Starting job queue worker...
Worker started: <hostname>-<uuid>
Polling interval: 5000ms
Batch size: 10
```

## Step 2: Create a Test Time Entry

Using your database client or Supabase dashboard, create a test time entry:

```sql
-- First, ensure you have a work order, employee, and settings configured
-- Check if you have required data
SELECT id FROM employees LIMIT 1;
SELECT id FROM work_orders LIMIT 1;

-- Insert a time entry with clock_out_at set
INSERT INTO work_order_time_entries (
  work_order_id, 
  tech_user_id, 
  clock_in_at, 
  clock_out_at, 
  break_minutes
) VALUES (
  '<work_order_id>',
  '<employee_id>',
  NOW() - INTERVAL '8 hours',
  NOW() - INTERVAL '30 minutes',
  30
) RETURNING id;
```

## Step 3: Manually Enqueue a Job

```sql
-- Replace <time_entry_id> with the ID from step 2
INSERT INTO job_queue (job_type, payload, status, run_after) 
VALUES (
  'time_entry_cost_post', 
  '{"time_entry_id": "<time_entry_id>"}',
  'PENDING',
  NOW()
) RETURNING id;
```

## Step 4: Monitor Worker Output

The worker should pick up the job within 5 seconds (default polling interval):

```
Found 1 pending job(s)
Processing job <job_id> (type: time_entry_cost_post, attempt: 1)
Job <job_id> completed successfully
```

## Step 5: Verify Job Cost Entry Created

```sql
-- Check if job_cost_entry was created
SELECT * FROM job_cost_entries 
WHERE source_type = 'TIME_ENTRY' 
AND source_id = '<time_entry_id>';

-- Verify idempotency key
SELECT * FROM job_cost_entries 
WHERE idempotency_key = 'time_entry:<time_entry_id>';

-- Check job status
SELECT * FROM job_queue WHERE id = '<job_id>';
-- Should show status = 'COMPLETED'
```

## Step 6: Test Idempotency

Try to enqueue the same job again:

```sql
INSERT INTO job_queue (job_type, payload, status, run_after) 
VALUES (
  'time_entry_cost_post', 
  '{"time_entry_id": "<same_time_entry_id>"}',
  'PENDING',
  NOW()
) RETURNING id;
```

The worker should process it, but no duplicate cost entry should be created:

```
Found 1 pending job(s)
Processing job <new_job_id> (type: time_entry_cost_post, attempt: 1)
Job <new_job_id> completed successfully
```

Verify only one cost entry exists:

```sql
SELECT COUNT(*) FROM job_cost_entries 
WHERE idempotency_key = 'time_entry:<time_entry_id>';
-- Should return 1, not 2
```

## Step 7: Test Retry Logic

Create a job with invalid data to trigger a failure:

```sql
INSERT INTO job_queue (job_type, payload, status, run_after) 
VALUES (
  'time_entry_cost_post', 
  '{"time_entry_id": "00000000-0000-0000-0000-000000000000"}',
  'PENDING',
  NOW()
) RETURNING id;
```

Worker output should show:

```
Found 1 pending job(s)
Processing job <job_id> (type: time_entry_cost_post, attempt: 1)
Job <job_id> failed: Time entry not found: 00000000-0000-0000-0000-000000000000
Job <job_id> will be retried (attempt 1/3)
```

After 3 attempts, it should be marked as FAILED:

```sql
SELECT status, attempts, last_error FROM job_queue WHERE id = '<job_id>';
-- Should show status = 'FAILED', attempts = 3
```

## Step 8: Test Admin API (Optional)

Using curl or Postman (requires valid auth token):

```bash
# List all jobs
curl -H "Authorization: Bearer <your_jwt_token>" \
  http://localhost:3000/api/admin/jobs?status=COMPLETED

# Get specific job
curl -H "Authorization: Bearer <your_jwt_token>" \
  http://localhost:3000/api/admin/jobs/<job_id>

# Retry a failed job
curl -X POST \
  -H "Authorization: Bearer <your_jwt_token>" \
  http://localhost:3000/api/admin/jobs/<failed_job_id>/retry
```

## Step 9: Test Graceful Shutdown

Press `Ctrl+C` in the worker terminal:

```
^C
Shutting down worker...
Worker stopped
```

## Troubleshooting

### Worker not picking up jobs

1. Check database connection: Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`
2. Check job status: `SELECT * FROM job_queue WHERE status = 'PENDING'`
3. Check run_after: Jobs with `run_after` in the future won't be processed yet

### Jobs failing with "Settings not found"

Ensure you have at least one row in the `settings` table:

```sql
INSERT INTO settings (company_name, default_labor_rate) 
VALUES ('Test Company', 50.00)
ON CONFLICT DO NOTHING;
```

### Jobs failing with "Labor cost type or cost code not configured"

Either:
1. Add `labor_cost_type_id` and `labor_cost_code_id` to settings, OR
2. Create a cost type with "labor" in the name:

```sql
-- Create labor cost type
INSERT INTO cost_types (name) VALUES ('Labor') RETURNING id;

-- Create cost code for labor
INSERT INTO cost_codes (code, name, cost_type_id) 
VALUES ('LABOR', 'Labor Costs', '<cost_type_id_from_above>');
```

## Success Criteria

- ✅ Worker starts and polls for jobs
- ✅ Time entry cost posting creates job_cost_entry
- ✅ Idempotency prevents duplicate entries
- ✅ Failed jobs retry up to 3 times
- ✅ Worker handles graceful shutdown
- ✅ Admin API returns job list
