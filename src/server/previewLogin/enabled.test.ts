import { isPreviewLoginEnabled, previewAuthPages } from "./enabled";

describe("isPreviewLoginEnabled", () => {
  test("is on for Vercel preview deploys", () => {
    expect(isPreviewLoginEnabled({ VERCEL: "1", VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(true);
  });

  test("is off for the Vercel production deploy", () => {
    expect(isPreviewLoginEnabled({ VERCEL: "1", VERCEL_ENV: "production", NODE_ENV: "production" })).toBe(false);
  });

  test("is off for local production builds and the homelab", () => {
    expect(isPreviewLoginEnabled({ NODE_ENV: "production" })).toBe(false);
  });

  test("is off for local dev and Vercel development", () => {
    expect(isPreviewLoginEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(isPreviewLoginEnabled({ VERCEL_ENV: "development", NODE_ENV: "development" })).toBe(false);
  });
});

describe("previewAuthPages", () => {
  test("previews send Sign in to the test user picker", () => {
    expect(previewAuthPages({ VERCEL_ENV: "preview" })).toEqual({ signIn: "/preview-login" });
  });

  test("everywhere else gets an empty object, never undefined", () => {
    // undefined overrides next-auth's own `pages` default and crashes /api/auth/signin.
    for (const env of [{ VERCEL_ENV: "production" }, { NODE_ENV: "production" }, { NODE_ENV: "development" }]) {
      const pages = previewAuthPages(env);
      expect(pages).toEqual({});
      expect(pages).not.toBeUndefined();
    }
  });
});
