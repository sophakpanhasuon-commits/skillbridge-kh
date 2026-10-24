import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id parameters (OWASP minimum recommendation: 19 MiB memory, 2 iterations, 1 lane).
 * The algorithm defaults to argon2id in this library.
 *
 * Why argon2id and not SHA-256? Fast hashes let an attacker who steals the database try
 * billions of guesses per second. Argon2id is deliberately slow AND memory-hungry, which
 * makes large-scale guessing expensive. Every hash also gets a random salt automatically,
 * so two users with the same password get different hashes.
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

/** Returns false for a wrong password AND for a malformed stored hash; never throws. */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}
