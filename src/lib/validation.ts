import type { ZodType } from 'zod';
import { HttpError } from './http-error.js';

export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'The request is invalid.', result.error.flatten());
  }
  return result.data;
}
