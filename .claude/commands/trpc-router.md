Create a new tRPC router for: $ARGUMENTS

Follow these patterns from this project:

1. Create router file at `src/server/api/routers/{name}.ts`
2. Use this structure:
```typescript
import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";

export const {name}Router = createTRPCRouter({
  // procedures here
});
```

3. Add to root router in `src/server/api/root.ts`
4. Use `protectedProcedure` for authenticated endpoints
5. Use `publicProcedure` only for unauthenticated access
6. Validate inputs with Zod schemas inline
7. Create colocated test file `{name}.test.ts` with basic test structure

Ask me what procedures this router needs before implementing.
