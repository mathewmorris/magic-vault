import { renderToStaticMarkup } from "react-dom/server";

jest.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import PreviewLoginPage from "./page";

const env = process.env as Record<string, string | undefined>;
const originalVercelEnv = env.VERCEL_ENV;

afterEach(() => {
  if (originalVercelEnv === undefined) delete env.VERCEL_ENV;
  else env.VERCEL_ENV = originalVercelEnv;
});

describe("Preview login page", () => {
  test("is a 404 on the production deploy", () => {
    env.VERCEL_ENV = "production";
    expect(() => PreviewLoginPage()).toThrow("NEXT_NOT_FOUND");
  });

  test("is a 404 on local production builds", () => {
    delete env.VERCEL_ENV;
    expect(() => PreviewLoginPage()).toThrow("NEXT_NOT_FOUND");
  });

  test("lists the four test users on previews", () => {
    env.VERCEL_ENV = "preview";
    const html = renderToStaticMarkup(PreviewLoginPage());

    for (const name of ["Nova", "Casey", "Dana", "Vic"]) {
      expect(html).toContain(`Sign in as ${name}`);
    }
    expect(html.match(/action="\/api\/preview-login"/g)).toHaveLength(4);
  });
});
