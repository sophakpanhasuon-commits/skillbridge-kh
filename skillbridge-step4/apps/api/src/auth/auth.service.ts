import { db } from "../db";
import { profiles, users } from "../db/schema";
import { AppError } from "../errors";
import type { RegisterInput } from "./auth.schemas";
import { hashPassword } from "./password";

export interface PublicUser {
  id: string;
  email: string;
  role: (typeof users.$inferSelect)["role"];
  fullName: string;
}

const PG_UNIQUE_VIOLATION = "23505";

/**
 * Drizzle may wrap the original PostgreSQL error inside `cause`, so look through the chain
 * instead of assuming where the error code lives.
 */
function hasPgCode(err: unknown, code: string): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 3 && typeof current === "object" && current !== null; depth++) {
    if ((current as { code?: unknown }).code === code) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export async function registerUser(input: RegisterInput): Promise<PublicUser> {
  // Hash BEFORE opening the transaction: it is slow CPU work, and we don't want to hold a
  // database connection (we only have 10) while the CPU is busy.
  const passwordHash = await hashPassword(input.password);

  try {
    // One transaction: either BOTH the user and the profile exist, or NEITHER does.
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: input.email, passwordHash })
        .returning({ id: users.id, email: users.email, role: users.role });

      if (!user) throw new Error("User insert returned no row");

      await tx.insert(profiles).values({ userId: user.id, fullName: input.fullName });

      return { id: user.id, email: user.email, role: user.role, fullName: input.fullName };
    });
  } catch (err) {
    // The UNIQUE constraint on users.email is the real guard: it is race-condition proof,
    // unlike a "SELECT then INSERT" check in application code.
    if (hasPgCode(err, PG_UNIQUE_VIOLATION)) {
      throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }
    throw err;
  }
}
