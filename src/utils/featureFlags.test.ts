import { afterEach, describe, expect, it } from "@jest/globals";

import { flagEnvName, isFeatureEnabled, parseFlag } from "./featureFlags";

describe("parseFlag", () => {
  it.each(["true", "TRUE", " 1 ", "on", "Yes"])("treats %p as on", (value) => {
    expect(parseFlag(value)).toBe(true);
  });

  it.each([undefined, null, "", "false", "0", "off", "nope"])("treats %p as off", (value) => {
    expect(parseFlag(value)).toBe(false);
  });
});

describe("isFeatureEnabled", () => {
  const original = process.env.NEXT_PUBLIC_FEATURE_AI_SCAN;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_FEATURE_AI_SCAN;
    else process.env.NEXT_PUBLIC_FEATURE_AI_SCAN = original;
  });

  it("is off by default", () => {
    delete process.env.NEXT_PUBLIC_FEATURE_AI_SCAN;
    expect(isFeatureEnabled("aiScan")).toBe(false);
  });

  it("reads the env variable", () => {
    process.env.NEXT_PUBLIC_FEATURE_AI_SCAN = "true";
    expect(isFeatureEnabled("aiScan")).toBe(true);
    expect(flagEnvName("aiScan")).toBe("NEXT_PUBLIC_FEATURE_AI_SCAN");
  });
});
