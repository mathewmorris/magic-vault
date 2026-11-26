import { execSync } from "node:child_process";

import { assertTestDatabase } from "./assertTestDatabase";

/** Runs once before the integration suite: bring the schema up to date. */
export default function globalSetup() {
  assertTestDatabase(process.env.DATABASE_URL);

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: process.env,
  });
}
