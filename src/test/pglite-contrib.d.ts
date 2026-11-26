// tsconfig uses moduleResolution "node", which ignores package "exports",
// so PGlite's contrib subpaths have no types without this.
declare module "@electric-sql/pglite/contrib/pg_trgm" {
  import type { Extension } from "@electric-sql/pglite";
  export const pg_trgm: Extension;
}
