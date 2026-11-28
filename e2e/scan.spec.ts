/**
 * The AI scanner in a real browser: signs in as test users, opens /scan with
 * a fake camera showing a real card, and checks the scanner loads past 0%,
 * the camera plays, nothing fails to load, and the card gets added.
 *
 * Runs in CI ("Scanner in a browser" in .github/workflows/ci.yml), which
 * builds the app with the scanner on, seeds the card with
 * e2e/scan/seed-cards.mjs and makes the fake camera video. Skipped without
 * E2E_FAKE_CAMERA and E2E_SCAN_TARGET.
 *
 * Findings are also printed as GitHub annotations, so they show on the PR's
 * checks without opening the log.
 */
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const videoFile = process.env.E2E_FAKE_CAMERA;
const targetFile = process.env.E2E_SCAN_TARGET;
const target = targetFile
  ? (JSON.parse(readFileSync(targetFile, "utf8")) as { name: string; set: string; collectorNumber: string })
  : null;

/** How long the models get to download and start. */
const LOAD_TIMEOUT_MS = 150_000;
/** How long, once loaded, the scanner gets to find and add the card. */
const ADD_TIMEOUT_MS = 90_000;

test.skip(!videoFile || !target, "Needs E2E_FAKE_CAMERA and E2E_SCAN_TARGET (see the CI job)");

test.use({
  permissions: ["camera"],
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${videoFile ?? ""}`,
    ],
  },
});

function annotate(level: "error" | "warning" | "notice", title: string, lines: string[]) {
  const escape = (text: string) => text.replace(/%/g, "%25").replace(/\r/g, "").replace(/\n/g, "%0A");
  console.log(`::${level} title=${escape(title)}::${escape(lines.join("\n").slice(0, 6000))}`);
}

/** Everything that went wrong in the page: errors, failed and refused requests. */
function watchProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
  page.on("requestfailed", (request) =>
    problems.push(`request failed: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`),
  );
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  return problems;
}

const USERS = [
  { id: "preview-user-newcomer", label: "Nova, no collections yet" },
  { id: "preview-user-collector", label: "Casey, has collections" },
];

for (const user of USERS) {
  test(`scans ${target?.name ?? "a card"} hands-free as ${user.label}`, async ({ page }) => {
    test.setTimeout(LOAD_TIMEOUT_MS + ADD_TIMEOUT_MS + 60_000);
    const problems = watchProblems(page);
    const timeline: string[] = [];
    const started = Date.now();
    const mark = (what: string) => timeline.push(`${((Date.now() - started) / 1000).toFixed(1)}s ${what}`);

    try {
      const signIn = await page.request.post("/api/preview-login", {
        form: { userId: user.id },
        maxRedirects: 0,
      });
      expect(signIn.status(), "test-user sign-in").toBe(303);
      mark("signed in");

      await page.goto("/scan");
      mark("opened /scan");

      // Progress while the models load, so a stall shows where it stopped.
      const loading = page.getByRole("status").filter({ hasText: /Loading the card scanner/ });
      let lastText = "";
      while (Date.now() - started < LOAD_TIMEOUT_MS) {
        const text = (await loading.textContent({ timeout: 1000 }).catch(() => null))?.trim() ?? null;
        if (text === null) break;
        if (text !== lastText) mark(text);
        lastText = text;
        await page.waitForTimeout(1000);
      }
      await expect(loading, "the scanner finished loading").toBeHidden({ timeout: 1000 });
      mark("scanner loaded");
      await expect(page.getByText(/reads card names instead/), "no fallback to the name reader").toHaveCount(0);

      await page.waitForFunction(
        () => {
          const video = document.querySelector("video");
          return !!video && video.videoWidth > 0 && !video.paused;
        },
        undefined,
        { timeout: 15_000 },
      );
      mark("camera playing");

      await expect(page.getByText(`Added ${target!.name}`).first(), "the card was added").toBeVisible({
        timeout: ADD_TIMEOUT_MS,
      });
      mark(`added ${target!.name}`);
      await expect(page.getByText(/Added this session: 1 card/)).toBeVisible();
    } finally {
      const debug = await page
        .locator("details")
        .allInnerTexts()
        .then((texts) => texts.join("\n").slice(0, 1500))
        .catch(() => "");
      annotate("notice", `Scan timeline (${user.label})`, debug ? [...timeline, "", debug] : timeline);
      if (problems.length > 0) annotate("error", `Page problems (${user.label})`, [...new Set(problems)]);
    }

    expect([...new Set(problems)], "no console errors or failed requests").toEqual([]);
  });
}
