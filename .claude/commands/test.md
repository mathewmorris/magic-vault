Generate a test file for: $ARGUMENTS

Follow these patterns from this project:

1. Colocate test file next to source: `{filename}.test.ts`
2. Use Arrange-Act-Assert pattern
3. Structure:
```typescript
import { prismaMock } from "~/server/__mocks__/db";

describe("{module}", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("{function/procedure}", () => {
    it("should {expected behavior}", async () => {
      // Arrange
      const input = {};
      prismaMock.model.method.mockResolvedValue(expected);

      // Act
      const result = await functionUnderTest(input);

      // Assert
      expect(result).toStrictEqual(expected);
    });
  });
});
```

4. For tRPC procedures, test authorization (FORBIDDEN, UNAUTHORIZED)
5. For async code, use `resolves`/`rejects` matchers
6. Run with `npm run test`

Read the source file first, then generate appropriate tests.
