import { customType } from "drizzle-orm/pg-core";

/**
 * Drizzle has no built-in `citext` type (case-insensitive text), so introspection
 * cannot map it. This tells Drizzle: "the SQL type is citext, the TypeScript type is string".
 */
export const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});
