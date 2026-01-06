# Postman Testing Guide

This document provides instructions for testing the Zenith PM Server API endpoints using Postman.

## Base URL

- **Local Development:** `http://localhost:3000`
- **Production/Vercel:** Your deployed URL

## Health Check Endpoint

### GET /health

Checks if the API is running and returns version information.

**Request:**
```
GET http://localhost:3000/health
```

**Expected Response:**
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

**Status Code:** `200 OK`

**Postman Test Script:**
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Response has ok: true", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.ok).to.eql(true);
});

pm.test("Response has status: up", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data.status).to.eql("up");
});
```

## Version Endpoint

### GET /version

Returns version information and git SHA if available.

**Request:**
```
GET http://localhost:3000/version
```

**Expected Response:**
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

**Status Code:** `200 OK`

**Postman Test Script:**
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Response has ok: true", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.ok).to.eql(true);
});

pm.test("Response has version", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data.version).to.exist;
});
```

## 404 Not Found

### GET /nonexistent

Tests the 404 handler for non-existent routes.

**Request:**
```
GET http://localhost:3000/nonexistent
```

**Expected Response:**
```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "NOT_FOUND",
    "message": "Route GET /nonexistent not found"
  }
}
```

**Status Code:** `404 Not Found`

**Postman Test Script:**
```javascript
pm.test("Status code is 404", function () {
    pm.response.to.have.status(404);
});

pm.test("Response has ok: false", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.ok).to.eql(false);
});

pm.test("Response has error code NOT_FOUND", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.error.code).to.eql("NOT_FOUND");
});
```

## Request Headers

All requests automatically include:
- `X-Request-Id` - Unique request identifier (auto-generated if not provided)
- `X-Correlation-Id` - Correlation identifier for tracing (same as Request-Id if not provided)

You can provide your own by adding these headers to your requests:
```
X-Request-Id: your-custom-request-id
X-Correlation-Id: your-custom-correlation-id
```

## Response Format

All API responses follow this envelope structure:

```typescript
{
  "ok": boolean,           // true for success, false for error
  "data": object | null,   // response data (null on error)
  "error": {               // error details (null on success)
    "code": string,
    "message": string,
    "details"?: any
  } | null,
  "meta"?: {               // optional metadata
    // ... additional metadata
  }
}
```

## Postman Collection Setup

1. Create a new collection named "Zenith PM Server"
2. Add an environment variable:
   - Variable: `base_url`
   - Initial value: `http://localhost:3000`
   - Current value: `http://localhost:3000`

3. Use `{{base_url}}` in your requests:
   - `{{base_url}}/health`
   - `{{base_url}}/version`

## Running Tests

1. Open Postman
2. Import or create the requests above
3. Run individual requests or use the Collection Runner
4. Verify all tests pass

## Troubleshooting

### Connection Refused
- Ensure the server is running: `npm run dev`
- Check the port in your `.env` file matches the base URL

### Environment Variables Not Set
- Create a `.env` file based on `.env.example`
- Ensure all required variables are set

### 500 Internal Server Error
- Check server logs for error details
- Verify environment variables are correct
- Ensure Supabase credentials are valid
