/**
 * An error we THROW ON PURPOSE for an expected situation (duplicate email, bad login, ...).
 * The global error handler turns it into a clean JSON response. Anything that is NOT an
 * AppError is a bug, and the client only ever sees a generic 500.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
