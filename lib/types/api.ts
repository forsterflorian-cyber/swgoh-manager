/**
 * Standard API response envelope.
 * All API routes should return this structure.
 */
export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Pagination metadata for list endpoints.
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Paginated API response.
 */
export type PaginatedResponse<T> = ApiEnvelope<{
  items: T[];
  pagination: PaginationMeta;
}>;

/**
 * Simple success response.
 */
export type SuccessResponse = ApiEnvelope<{ success: boolean }>;

/**
 * ID response for create operations.
 */
export type IdResponse = ApiEnvelope<{ id: string }>;

/**
 * Count response for bulk operations.
 */
export type CountResponse = ApiEnvelope<{ count: number }>;

/**
 * Error codes for structured error handling.
 */
export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

/**
 * Structured error response.
 */
export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Extended API envelope with structured error.
 */
export type ApiEnvelopeWithError<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };