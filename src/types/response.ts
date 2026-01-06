export interface ErrorDetails {
  code: string;
  message: string;
  details?: unknown;
}

export interface ResponseEnvelope<T = unknown> {
  ok: boolean;
  data: T | null;
  error: ErrorDetails | null;
  meta?: Record<string, unknown>;
}

export function successResponse<T>(data: T, meta?: Record<string, unknown>): ResponseEnvelope<T> {
  return {
    ok: true,
    data,
    error: null,
    ...(meta && { meta }),
  };
}

export function errorResponse(
  code: string,
  message: string,
  details?: unknown,
  meta?: Record<string, unknown>
): ResponseEnvelope<null> {
  return {
    ok: false,
    data: null,
    error: {
      code,
      message,
      details,
    },
    ...(meta && { meta }),
  };
}
