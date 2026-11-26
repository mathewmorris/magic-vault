const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * The integration suite migrates and truncates the database it points at, so
 * refuse to run unless DATABASE_URL is a local database with "test" in its
 * name. This keeps a stray `.env` from aiming the suite at a dev or
 * production database.
 */
export const assertTestDatabase = (databaseUrl: string | undefined): URL => {
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. Point it at a throwaway local Postgres database, e.g. " +
        "postgresql://postgres:postgres@localhost:5432/magicvault_test",
    );
  }

  const url = new URL(databaseUrl);
  const dbName = url.pathname.replace(/^\//, "");

  if (!LOCAL_HOSTS.has(url.hostname) || !dbName.includes("test")) {
    throw new Error(
      `Refusing to run integration tests against ${url.hostname}/${dbName}. ` +
        'DATABASE_URL must point at localhost and the database name must contain "test".',
    );
  }

  return url;
};
