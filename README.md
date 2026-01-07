# Zenith PM Server

Production-grade Express + TypeScript API that runs locally and on Vercel serverless.

## Features

- 🚀 Express.js with TypeScript
- 📦 Vercel serverless deployment support
- 🔒 Helmet for security headers
- 🌐 CORS enabled
- 📝 Structured logging with Pino
- ✅ Zod-based environment validation
- 🧪 Vitest for testing
- 🎨 ESLint + Prettier for code quality
- 🔄 Hot reload in development with tsx

## Prerequisites

- Node.js 18+ 
- npm or yarn

## Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd zenith-pm-server
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy the example environment file and update with your values:

```bash
cp .env.example .env
```

Edit `.env` and provide your actual values:

```env
NODE_ENV=development
PORT=3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
WORKER_SECRET=your-worker-secret
APP_REPORT_WEBHOOK_SECRET=your-webhook-secret
LOG_LEVEL=info
```

### 4. Run the development server

```bash
npm run dev
```

The server will start on `http://localhost:3000`

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build the TypeScript project
- `npm start` - Start production server (requires build first)
- `npm run worker` - Start the background job queue worker
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run lint` - Lint code with ESLint
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting

## API Endpoints

### Health Check

**GET** `/health`

Returns the health status of the API.

**Response:**
```json
{
  "ok": true,
  "data": {
    "status": "up",
    "version": "1.0.0",
    "env": "development"
  },
  "error": null
}
```

### Version

**GET** `/version`

Returns version information including git SHA if available.

**Response:**
```json
{
  "ok": true,
  "data": {
    "version": "1.0.0",
    "gitSha": "abc123..."
  },
  "error": null
}
```

### Current User (Authentication Required)

**GET** `/api/me`

Returns the authenticated user's employee record and auth information.

**Authentication:** Requires valid JWT token in Authorization header.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response (200 OK):**
```json
{
  "ok": true,
  "data": {
    "employee": {
      "id": "uuid",
      "display_name": "John Doe",
      "email": "john@example.com",
      "phone": "+1234567890",
      "role": "ADMIN",
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    },
    "auth": {
      "userId": "uuid",
      "email": "john@example.com",
      "claims": {}
    }
  },
  "error": null
}
```

**Error Responses:**

401 Unauthorized - Missing or invalid token:
```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid Authorization header"
  }
}
```

403 Forbidden - No employee record or inactive account:
```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "FORBIDDEN",
    "message": "No employee record found for this user"
  }
}
```


## Authentication

This API uses Supabase JWT tokens for authentication and employee-based RBAC (Role-Based Access Control).

### How to Get a Test JWT Token

1. **Sign up/Sign in via Supabase Auth UI** or use the Supabase client library
2. **Use the Supabase Dashboard:**
   - Go to your Supabase project dashboard
   - Navigate to Authentication > Users
   - Click on a user to view their details
   - Copy the access token from the user's session
   
3. **Use Supabase JavaScript Client:**
   ```javascript
   import { createClient } from '@supabase/supabase-js'
   
   const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
   
   // Sign in
   const { data, error } = await supabase.auth.signInWithPassword({
     email: 'user@example.com',
     password: 'password'
   })
   
   // Get the JWT token
   const token = data.session.access_token
   ```

4. **Use the token in API requests:**
   ```bash
   curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
        http://localhost:3000/api/me
   ```

### Testing Authentication in Postman

1. **Create a new request** in Postman
2. **Set the request URL** to `http://localhost:3000/api/me`
3. **Add Authorization header:**
   - Click on the "Authorization" tab
   - Select "Bearer Token" from the Type dropdown
   - Paste your JWT token in the Token field
4. **Send the request**

**Test Cases:**
- Without Authorization header → 401
- With invalid token → 401  
- With valid token but no employee record → 403
- With valid token and active employee → 200

### Employee Roles

The system supports three role types:
- **TECH** - Technician role (default)
- **OFFICE** - Office staff role
- **ADMIN** - Administrator role

### RBAC Middleware

Use the `requireRole` middleware to restrict routes to specific roles:

```typescript
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';

// Only allow ADMIN users
router.get('/admin/users', 
  requireAuth, 
  requireEmployee, 
  requireRole(['ADMIN']), 
  handler
);

// Allow ADMIN and OFFICE users
router.get('/reports', 
  requireAuth, 
  requireEmployee, 
  requireRole(['ADMIN', 'OFFICE']), 
  handler
);
```

## Response Envelope

All API responses follow a standard envelope format:

```typescript
{
  "ok": true | false,
  "data": <object | null>,
  "error": {
    "code": string,
    "message": string,
    "details"?: any
  } | null,
  "meta"?: { ... }
}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| NODE_ENV | No | development | Environment (development/production/test) |
| PORT | No | 3000 | Server port (local only) |
| SUPABASE_URL | Yes | - | Supabase project URL |
| SUPABASE_SERVICE_ROLE_KEY | Yes | - | Supabase service role key |
| WORKER_SECRET | Yes | - | Secret for worker authentication |
| APP_REPORT_WEBHOOK_SECRET | Yes | - | Secret for webhook authentication |
| LOG_LEVEL | No | info | Logging level (fatal/error/warn/info/debug/trace) |
| WORKER_POLL_INTERVAL_MS | No | 5000 | Worker polling interval in milliseconds |
| WORKER_ID | No | hostname-uuid | Unique worker instance identifier |
| WORKER_BATCH_SIZE | No | 10 | Number of jobs to process per batch |

## Project Structure

```
├── api/
│   └── [...all].ts          # Vercel catch-all handler
├── src/
│   ├── app.ts                # Express app factory
│   ├── server.ts             # Local dev entry
│   ├── config/
│   │   ├── env.ts            # Zod-validated env config
│   │   └── supabase.ts       # Supabase client singleton
│   ├── middleware/
│   │   ├── requestId.ts      # Request/correlation ID middleware
│   │   ├── errorHandler.ts   # Centralized error handler
│   │   ├── notFound.ts       # 404 handler
│   │   ├── requireAuth.ts    # JWT authentication middleware
│   │   ├── requireEmployee.ts # Employee record middleware
│   │   └── requireRole.ts    # RBAC middleware factory
│   ├── routes/
│   │   ├── health.ts         # Health & version routes
│   │   ├── me.ts             # Current user endpoint
│   │   └── admin/
│   │       └── jobs.ts       # Job queue admin routes
│   ├── workers/
│   │   ├── jobQueueWorker.ts # Main worker loop
│   │   └── processors/
│   │       └── timeCostPost.ts # Time entry cost posting processor
│   ├── scripts/
│   │   └── startWorker.ts    # Worker CLI entry point
│   └── types/
│       ├── response.ts       # Response envelope types
│       ├── auth.ts           # Auth & Employee types
│       └── express.d.ts      # Express Request extensions
├── docs/
│   └── postman_notes.md      # Postman testing guide
├── .env.example              # Environment template
├── package.json
├── tsconfig.json             # TypeScript configuration
├── eslint.config.js          # ESLint configuration
├── prettier.config.js        # Prettier configuration
├── vitest.config.ts          # Vitest configuration
└── README.md
```

## Deployment

### Vercel

This project is configured for Vercel serverless deployment.

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

The Vercel handler in `api/[...all].ts` will catch all routes and forward them to Express.

## Development

### TypeScript Path Aliases

The project uses `@/` as a path alias for the `src/` directory. For example:

```typescript
import { env } from '@/config/env.js';
import { successResponse } from '@/types/response.js';
```

### Middleware Stack

1. **Helmet** - Security headers
2. **CORS** - Cross-origin resource sharing
3. **JSON Body Parser** - Parse JSON with 1MB limit
4. **Request ID** - Generate/extract request and correlation IDs
5. **Pino HTTP** - Structured request logging

### Error Handling

- 404 errors return a standard error envelope
- All errors are caught by the centralized error handler
- Stack traces are hidden in production
- Errors are logged with request context

## Background Job Queue Worker

The system includes a background worker for processing asynchronous jobs from the `job_queue` table.

### Starting the Worker

```bash
npm run worker
```

### How It Works

1. **Polling**: Worker polls the `job_queue` table every `WORKER_POLL_INTERVAL_MS` (default: 5000ms)
2. **Locking**: Jobs are locked before processing to prevent duplicate processing
3. **Processing**: Jobs are routed to appropriate processors based on `job_type`
4. **Retry Logic**: Failed jobs are retried up to `max_attempts` (default: 3)
5. **Status Updates**: Jobs are marked as `COMPLETED` or `FAILED` based on outcome

### Supported Job Types

#### `time_entry_cost_post`

Processes time entry cost posting for labor costs. When a time entry is clocked out, a job is automatically enqueued to create a `job_cost_entry`.

**Payload:**
```json
{
  "time_entry_id": "uuid"
}
```

**Processing Steps:**
1. Fetch time entry with clock_in/clock_out times
2. Calculate hours worked (accounting for break time)
3. Fetch labor rate from employee or settings
4. Calculate labor cost (hours × rate)
5. Create job_cost_entry with idempotency key
6. Update work order total cost (if tracked)

**Idempotency:** Uses key format `time_entry:<time_entry_id>` to prevent duplicate cost entries

### Admin API Endpoints

#### List Jobs
```
GET /api/admin/jobs?status=PENDING&job_type=time_entry_cost_post&page=1&limit=50
```

**Query Parameters:**
- `status` (optional): Filter by status (PENDING, COMPLETED, FAILED)
- `job_type` (optional): Filter by job type
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 50)

**Response:**
```json
{
  "ok": true,
  "data": {
    "jobs": [...],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 100
    }
  }
}
```

#### Get Single Job
```
GET /api/admin/jobs/:id
```

#### Retry Failed Job
```
POST /api/admin/jobs/:id/retry
```

Resets a failed job to PENDING status for retry.

### Manual Job Enqueueing

For testing or manual job creation:

```sql
INSERT INTO job_queue (job_type, payload) 
VALUES ('time_entry_cost_post', '{"time_entry_id": "your-uuid-here"}');
```

### Worker Configuration

Environment variables for worker configuration:

- `WORKER_POLL_INTERVAL_MS`: Polling interval in milliseconds (default: 5000)
- `WORKER_ID`: Unique worker instance identifier (default: hostname-uuid)
- `WORKER_BATCH_SIZE`: Number of jobs to process per batch (default: 10)

### Graceful Shutdown

The worker handles `SIGINT` and `SIGTERM` signals for graceful shutdown:

```bash
# Stop worker
Ctrl+C
```

## License

ISC
