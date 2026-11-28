import { isPreviewLoginEnabled } from "./enabled";

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
