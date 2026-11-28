import { type PrismaClient } from "@prisma/client";
import { type DeepMockProxy, type mockDeep, mockReset } from "jest-mock-extended";

import { prisma } from "~/server/db";

import { GET, POST } from "./route";

jest.mock("~/server/db", () => {
  const actual = jest.requireActual<{ mockDeep: typeof mockDeep }>("jest-mock-extended");
  return { prisma: actual.mockDeep<PrismaClient>() };
});

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const env = process.env as Record<string, string | undefined>;
const original = { VERCEL_ENV: env.VERCEL_ENV, NODE_ENV: env.NODE_ENV };

function pick(userId: string) {
  const body = new FormData();
  body.set("userId", userId);
  return new Request("https://magic-vault-git-x-magicians.vercel.app/api/preview-login", { method: "POST", body });
}

beforeEach(() => {
  mockReset(prismaMock);
});

function setEnv(key: "VERCEL_ENV" | "NODE_ENV", value: string | undefined) {
  if (value === undefined) delete env[key];
  else env[key] = value;
}

afterEach(() => {
  setEnv("VERCEL_ENV", original.VERCEL_ENV);
  setEnv("NODE_ENV", original.NODE_ENV);
});

describe("preview login API outside previews", () => {
  test.each([
    ["Vercel production", { VERCEL_ENV: "production", NODE_ENV: "production" }],
    ["a local production build", { VERCEL_ENV: undefined, NODE_ENV: "production" }],
    ["local dev", { VERCEL_ENV: undefined, NODE_ENV: "development" }],
  ])("returns 404 and touches nothing on %s", async (_label, values) => {
    setEnv("VERCEL_ENV", values.VERCEL_ENV);
    setEnv("NODE_ENV", values.NODE_ENV);

    const post = await POST(pick("preview-user-vintage"));
    const get = GET(new Request("https://magic-vault.mathewmorris.com/api/preview-login"));

    expect(post.status).toBe(404);
    expect(get.status).toBe(404);
    expect(post.headers.get("set-cookie")).toBeNull();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.session.create).not.toHaveBeenCalled();
  });
});

describe("preview login API on previews", () => {
  beforeEach(() => {
    env.VERCEL_ENV = "preview";
  });

  test("rejects anyone who isn't a test user", async () => {
    const response = await POST(pick("cmrealuser123"));

    expect(response.status).toBe(400);
    expect(prismaMock.session.create).not.toHaveBeenCalled();
  });

  test("signs in as the picked test user and lands on the dashboard", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ email: "vic@preview.magic-vault.invalid" } as never);

    const response = await POST(pick("preview-user-vintage"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://magic-vault-git-x-magicians.vercel.app/");
    const session = prismaMock.session.create.mock.calls[0]![0].data as unknown as { userId: string; sessionToken: string };
    expect(session.userId).toBe("preview-user-vintage");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`__Secure-next-auth.session-token=${session.sessionToken}`);
    expect(cookie.toLowerCase()).toContain("httponly");
  });

  test("GET sends people to the picker", () => {
    const response = GET(new Request("https://magic-vault-git-x-magicians.vercel.app/api/preview-login"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://magic-vault-git-x-magicians.vercel.app/preview-login");
  });
});
