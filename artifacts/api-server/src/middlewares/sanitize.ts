/**
 * Input sanitization middleware
 *
 * Recursively traverses the JSON request body and strips any HTML tags from
 * string values before they reach route handlers or the database.
 *
 * This is a defense-in-depth measure — individual Zod schemas are still the
 * primary validation layer. If a field is ever accidentally sent as HTML, this
 * middleware ensures it is cleaned before storage.
 *
 * No rich-text fields exist in the current schema, so stripping is safe for
 * every text column.
 */

import { type Request, type Response, type NextFunction } from "express";

/** Strip HTML tags from a string (only text content survives). */
function stripHtml(value: string): string {
  // Two-pass approach:
  //   1. Remove complete tags including attributes.
  //   2. Decode the most dangerous entities that could appear after partial stripping.
  return value
    .replace(/<[^>]*>/g, "")           // remove tags
    .replace(/&lt;/gi, "<")            // decode entities → allow Zod .refine to catch them
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    // Second pass to remove any newly-decoded tags
    .replace(/<[^>]*>/g, "");
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return stripHtml(value);
  if (Array.isArray(value))     return value.map(sanitizeValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitizeValue(v)]),
    );
  }
  return value;
}

export function sanitizeInputs(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body);
  }
  next();
}
