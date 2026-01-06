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

## Customer Endpoints

### GET /api/customers

List customers with pagination, search, and sort.

**Authentication:** Required (Bearer token)

**Query Parameters:**
- `limit` (optional, default: 20, max: 100) - Number of results per page
- `offset` (optional, default: 0) - Number of records to skip
- `search` (optional) - Search by name, email, or phone (case-insensitive)
- `sort` (optional) - Sort by field (e.g., `name:asc`, `created_at:desc`)

**Request:**
```
GET http://localhost:3000/api/customers?search=acme&limit=10
Authorization: Bearer <your-jwt-token>
```

**Expected Response:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "customer_no": "CUST-000001",
      "name": "Acme Corp",
      "contact_name": "John Doe",
      "phone": "+1234567890",
      "email": "john@acme.com",
      "billing_street": "123 Main St",
      "billing_city": "Springfield",
      "billing_state": "IL",
      "billing_zip": "62701",
      "service_street": null,
      "service_city": null,
      "service_state": null,
      "service_zip": null,
      "notes": null,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z",
      "created_by": "uuid",
      "updated_by": "uuid",
      "qbo_customer_ref": null,
      "qbo_last_synced_at": null
    }
  ],
  "error": null,
  "meta": {
    "pagination": {
      "limit": 10,
      "offset": 0,
      "total": 1
    }
  }
}
```

**Status Code:** `200 OK`

**Access:** TECH (read-only), OFFICE, ADMIN

### POST /api/customers

Create a new customer.

**Authentication:** Required (Bearer token)

**Access:** OFFICE, ADMIN only (TECH returns 403)

**Request:**
```
POST http://localhost:3000/api/customers
Authorization: Bearer <your-jwt-token>
Content-Type: application/json

{
  "name": "New Customer Inc",
  "contact_name": "Jane Smith",
  "phone": "+1987654321",
  "email": "jane@newcustomer.com",
  "billing_street": "456 Oak Ave",
  "billing_city": "Chicago",
  "billing_state": "IL",
  "billing_zip": "60601",
  "notes": "Important customer"
}
```

**Expected Response:**
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "customer_no": "CUST-000002",
    "name": "New Customer Inc",
    ...
  },
  "error": null
}
```

**Status Code:** `201 Created`

### GET /api/customers/:id

Get a single customer by ID.

**Authentication:** Required (Bearer token)

**Request:**
```
GET http://localhost:3000/api/customers/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <your-jwt-token>
```

**Expected Response:**
```json
{
  "ok": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "customer_no": "CUST-000001",
    "name": "Acme Corp",
    ...
  },
  "error": null
}
```

**Status Code:** `200 OK` or `404 Not Found`

**Access:** TECH (read-only), OFFICE, ADMIN

### PATCH /api/customers/:id

Update an existing customer.

**Authentication:** Required (Bearer token)

**Access:** OFFICE, ADMIN only (TECH returns 403)

**Request:**
```
PATCH http://localhost:3000/api/customers/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <your-jwt-token>
Content-Type: application/json

{
  "name": "Updated Customer Name",
  "phone": "+1111111111"
}
```

**Expected Response:**
```json
{
  "ok": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "customer_no": "CUST-000001",
    "name": "Updated Customer Name",
    ...
  },
  "error": null
}
```

**Status Code:** `200 OK` or `404 Not Found`

## Location Endpoints

### GET /api/customers/:customerId/locations

List all locations for a specific customer.

**Authentication:** Required (Bearer token)

**Request:**
```
GET http://localhost:3000/api/customers/550e8400-e29b-41d4-a716-446655440000/locations
Authorization: Bearer <your-jwt-token>
```

**Expected Response:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "customer_id": "550e8400-e29b-41d4-a716-446655440000",
      "label": "Main Office",
      "street": "123 Main St",
      "city": "Springfield",
      "state": "IL",
      "zip": "62701",
      "notes": null,
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ],
  "error": null
}
```

**Status Code:** `200 OK` or `404 Not Found` (if customer doesn't exist)

**Access:** TECH (read-only), OFFICE, ADMIN

### POST /api/customers/:customerId/locations

Create a new location for a customer.

**Authentication:** Required (Bearer token)

**Access:** OFFICE, ADMIN only (TECH returns 403)

**Request:**
```
POST http://localhost:3000/api/customers/550e8400-e29b-41d4-a716-446655440000/locations
Authorization: Bearer <your-jwt-token>
Content-Type: application/json

{
  "label": "Warehouse",
  "street": "789 Industrial Blvd",
  "city": "Springfield",
  "state": "IL",
  "zip": "62702",
  "notes": "Back entrance only",
  "is_active": true
}
```

**Expected Response:**
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "customer_id": "550e8400-e29b-41d4-a716-446655440000",
    "label": "Warehouse",
    ...
  },
  "error": null
}
```

**Status Code:** `201 Created` or `404 Not Found` (if customer doesn't exist)

### GET /api/locations/:id

Get a single location by ID.

**Authentication:** Required (Bearer token)

**Request:**
```
GET http://localhost:3000/api/locations/660f9511-f3ac-52e5-b827-557766551111
Authorization: Bearer <your-jwt-token>
```

**Expected Response:**
```json
{
  "ok": true,
  "data": {
    "id": "660f9511-f3ac-52e5-b827-557766551111",
    "customer_id": "550e8400-e29b-41d4-a716-446655440000",
    "label": "Main Office",
    ...
  },
  "error": null
}
```

**Status Code:** `200 OK` or `404 Not Found`

**Access:** TECH (read-only), OFFICE, ADMIN

### PATCH /api/locations/:id

Update an existing location.

**Authentication:** Required (Bearer token)

**Access:** OFFICE, ADMIN only (TECH returns 403)

**Request:**
```
PATCH http://localhost:3000/api/locations/660f9511-f3ac-52e5-b827-557766551111
Authorization: Bearer <your-jwt-token>
Content-Type: application/json

{
  "city": "Chicago",
  "is_active": false
}
```

**Expected Response:**
```json
{
  "ok": true,
  "data": {
    "id": "660f9511-f3ac-52e5-b827-557766551111",
    "customer_id": "550e8400-e29b-41d4-a716-446655440000",
    "city": "Chicago",
    "is_active": false,
    ...
  },
  "error": null
}
```

**Status Code:** `200 OK` or `404 Not Found`

## Common Error Responses

### 401 Unauthorized
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

### 403 Forbidden
```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied. Required role(s): OFFICE, ADMIN"
  }
}
```

### 400 Validation Error
```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [
      {
        "code": "too_small",
        "minimum": 1,
        "type": "string",
        "path": ["name"],
        "message": "String must contain at least 1 character(s)"
      }
    ]
  }
}
```

### 404 Not Found
```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "NOT_FOUND",
    "message": "Customer not found"
  }
}
```
