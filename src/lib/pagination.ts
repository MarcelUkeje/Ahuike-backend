/** Pagination query params accepted by all list endpoints. */
export interface PaginationQuery {
  limit: number;
  offset: number;
}

/** Envelope returned by all paginated list endpoints. */
export interface PaginatedResult<T> {
  items: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/** Default and hard-cap values used across all list endpoints. */
export const PAGINATION_DEFAULTS = {
  limit: 20,
  maxLimit: 100,
  offset: 0,
} as const;
