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

## Project Structure

```
├── api/
│   └── [...all].ts          # Vercel catch-all handler
├── src/
│   ├── app.ts                # Express app factory
│   ├── server.ts             # Local dev entry
│   ├── config/
│   │   └── env.ts            # Zod-validated env config
│   ├── middleware/
│   │   ├── requestId.ts      # Request/correlation ID middleware
│   │   ├── errorHandler.ts   # Centralized error handler
│   │   └── notFound.ts       # 404 handler
│   ├── routes/
│   │   └── health.ts         # Health & version routes
│   └── types/
│       └── response.ts       # Response envelope types
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

## License

ISC
