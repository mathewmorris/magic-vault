import { signInHref } from "./signInHref";

describe("signInHref", () => {
  test("encodes the page to come back to", () => {
    expect(signInHref("/scan?collection=abc")).toBe(
      "/api/auth/signin?callbackUrl=%2Fscan%3Fcollection%3Dabc",
    );
  });
});
