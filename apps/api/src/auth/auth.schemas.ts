import { z } from "zod";

// Tiny starter list (FR-AUTH-01). For the thesis, upgrade this to a "top 10,000 passwords" file.
const COMMON_PASSWORDS = new Set([
  "password123",
  "password1234",
  "1234567890",
  "12345678910",
  "0123456789",
  "qwertyuiop",
  "1q2w3e4r5t",
  "abcdefghij",
  "iloveyou123",
  "admin12345",
  "welcome123",
  "letmein1234",
]);

/**
 * `.strict()` rejects unknown keys. That is what stops a client from sending
 * `"role": "admin"` and hoping the server copies it into the database
 * (a "mass assignment" vulnerability). Registration ALWAYS creates a student.
 */
export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z
      .string()
      .min(10, "Password must be at least 10 characters")
      .max(128, "Password must be at most 128 characters")
      .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), "Password is too common"),
    fullName: z.string().trim().min(1).max(100),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
