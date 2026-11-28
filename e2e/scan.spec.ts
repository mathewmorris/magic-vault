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
 * Four runs: two test users with the card upright, one with the card held
 * upside down (E2E_FAKE_CAMERA_FLIPPED), and one with WebGPU switched on
 * (SwiftShader, a software GPU), since phones run the models on WebGPU and
 * headless Chromium otherwise has none.
 *
 * Findings are also printed as GitHub annotations, so they show on the PR's
 * checks without opening the log.
 */
import { chromium, expect, test, type CDPSession, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const videoFile = process.env.E2E_FAKE_CAMERA;
const flippedVideoFile = process.env.E2E_FAKE_CAMERA_FLIPPED ?? videoFile;
const targetFile = process.env.E2E_SCAN_TARGET;
const target = targetFile
  ? (JSON.parse(readFileSync(targetFile, "utf8")) as { name: string; set: string; collectorNumber: string })
  : null;

/** How long the models get to download and start. */
const LOAD_TIMEOUT_MS = 150_000;
/** How long, once loaded, the scanner gets to find and add the card. */
const ADD_TIMEOUT_MS = 90_000;

test.skip(!videoFile || !target, "Needs E2E_FAKE_CAMERA and E2E_SCAN_TARGET (see the CI job)");

function cameraArgs(video: string | undefined): string[] {
  return [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-video-capture=${video ?? ""}`,
  ];
}

/** WebGPU on SwiftShader, so the WebGPU path runs without a real GPU. */
const WEBGPU_ARGS = ["--enable-unsafe-webgpu", "--enable-unsafe-swiftshader", "--use-webgpu-adapter=swiftshader"];

function annotate(level: "error" | "warning" | "notice", title: string, lines: string[]) {
  const escape = (text: string) => text.replace(/%/g, "%25").replace(/\r/g, "").replace(/\n/g, "%0A");
  console.log(`::${level} title=${escape(title)}::${escape(lines.join("\n").slice(0, 6000))}`);
}

/**
 * Requests that fail in a healthy page: Next cancels link prefetches when the
 * page navigates, and Vercel's analytics script only exists on Vercel.
 */
const EXPECTED_FAILURES = [/[?&]_rsc=/, /\/_vercel\/insights\//];
const expected = (text: string) => EXPECTED_FAILURES.some((pattern) => pattern.test(text));

/** Everything that went wrong in the page: errors, failed and refused requests. */
function watchProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const where = message.location().url;
    if (expected(where)) return;
    problems.push(`console.error: ${message.text()}${where ? ` (${where})` : ""}`);
  });
  page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
  page.on("requestfailed", (request) => {
    if (!expected(request.url()))
      problems.push(`request failed: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !expected(response.url()))
      problems.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  return problems;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([promise, new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms))]);
}

/** True when the page's main thread answers within `ms`. */
async function responsive(page: Page, ms = 3000): Promise<boolean> {
  return (await withTimeout(page.evaluate(() => true), ms)) === true;
}

type CallFrame = {
  functionName: string;
  url: string;
  location: { scriptId: string; lineNumber: number; columnNumber: number };
};

/** Maps a frame in a built chunk back to its source, using the chunk's .map. */
async function original(page: Page, frame: CallFrame): Promise<string | null> {
  if (!frame.url.startsWith("http")) return null;
  try {
    const response = await page.request.get(`${frame.url}.map`);
    if (!response.ok()) return null;
    const { SourceMapConsumer } = await import("source-map-js");
    const consumer = new SourceMapConsumer(JSON.parse(await response.text()) as never);
    const pos = consumer.originalPositionFor({
      line: frame.location.lineNumber + 1,
      column: frame.location.columnNumber,
    });
    return pos.source ? `${pos.source}:${pos.line ?? "?"}:${pos.column ?? "?"}${pos.name ? ` (${pos.name})` : ""}` : null;
  } catch {
    return null;
  }
}

/**
 * Pauses the page's main thread and says where it is: the way to tell which
 * part of the scanner is spinning when the page stops answering.
 */
async function mainThreadStack(page: Page): Promise<string[]> {
  let cdp: CDPSession | null = null;
  try {
    cdp = await page.context().newCDPSession(page);
    const session = cdp;
    const paused = new Promise<{ callFrames: CallFrame[] }>((resolve) =>
      session.once("Debugger.paused", (event) => resolve(event as { callFrames: CallFrame[] })),
    );
    await withTimeout(session.send("Debugger.enable"), 10_000);
    await withTimeout(session.send("Debugger.pause"), 10_000);
    const event = await withTimeout(paused, 15_000);
    if (event === "timeout") return ["(the debugger couldn't pause the page)"];
    const lines: string[] = [];
    for (const frame of event.callFrames.slice(0, 12)) {
      const { lineNumber, columnNumber, scriptId } = frame.location;
      const mapped = await original(page, frame);
      let snippet = "";
      if (!mapped) {
        const source = await withTimeout(session.send("Debugger.getScriptSource", { scriptId }), 5000);
        if (source !== "timeout") {
          const line = source.scriptSource.split("\n")[lineNumber] ?? "";
          snippet = ` near: ${line.slice(Math.max(0, columnNumber - 80), columnNumber + 80)}`;
        }
      }
      lines.push(
        `at ${frame.functionName || "(anonymous)"} ${frame.url.split("/").slice(-2).join("/")}:${lineNumber + 1}:${columnNumber}` +
          (mapped ? ` = ${mapped}` : snippet),
      );
    }
    await withTimeout(session.send("Debugger.resume"), 5000);
    return lines;
  } catch (error) {
    return [`(couldn't read the stack: ${error instanceof Error ? error.message : String(error)})`];
  } finally {
    await cdp?.detach().catch(() => undefined);
  }
}

type ScanCase = {
  /** Test user (src/server/previewLogin/testUsers.ts). */
  id: string;
  label: string;
  video: string | undefined;
  webGpu?: boolean;
};

const CASES: ScanCase[] = [
  { id: "preview-user-newcomer", label: "Nova, no collections yet", video: videoFile },
  { id: "preview-user-collector", label: "Casey, has collections", video: videoFile },
  { id: "preview-user-deckbuilder", label: "Dana, card held upside down", video: flippedVideoFile },
  { id: "preview-user-vintage", label: "Vic, on WebGPU", video: videoFile, webGpu: true },
];

// Each case needs its own camera video (a browser launch flag), so each
// launches its own browser instead of sharing the worker's.
for (const user of CASES) defineScanTest(user);

function defineScanTest(user: ScanCase) {
  test(`scans ${target?.name ?? "a card"} hands-free as ${user.label}`, async ({ baseURL }) => {
    test.setTimeout(LOAD_TIMEOUT_MS + ADD_TIMEOUT_MS + 60_000);
    const browser = await chromium.launch({
      args: [...cameraArgs(user.video), ...(user.webGpu ? WEBGPU_ARGS : [])],
    });
    const context = await browser.newContext({ baseURL, permissions: ["camera"] });
    const page = await context.newPage();
    const problems = watchProblems(page);
    const timeline: string[] = [];
    const started = Date.now();
    const mark = (what: string) => timeline.push(`${((Date.now() - started) / 1000).toFixed(1)}s ${what}`);
    // Which backend ran the models, and any switch from WebGPU to WASM.
    page.on("console", (message) => {
      if (/webgpu|wasm/i.test(message.text())) mark(`console.${message.type()}: ${message.text().slice(0, 300)}`);
    });

    try {
      const signIn = await page.request.post("/api/preview-login", {
        form: { userId: user.id },
        maxRedirects: 0,
      });
      expect(signIn.status(), "test-user sign-in").toBe(303);
      mark("signed in");

      await page.goto("/scan");
      mark("opened /scan");
      const gpu = await page.evaluate(async () => {
        const nav = navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } };
        if (!nav.gpu) return "no navigator.gpu";
        const adapter = await nav.gpu.requestAdapter().catch((e: unknown) => String(e));
        return adapter ? "WebGPU adapter found" : "no WebGPU adapter";
      });
      mark(gpu);
      if (user.webGpu) expect(gpu, "this run needs WebGPU to test the WebGPU path").toBe("WebGPU adapter found");

      // Progress while the models load, so a stall shows where it stopped.
      const loading = page.getByRole("status").filter({ hasText: /Loading the card scanner/ });
      let lastText = "";
      let lastChange = Date.now();
      let sampled = false;
      while (Date.now() - started < LOAD_TIMEOUT_MS) {
        if (!(await responsive(page))) {
          mark("the page stopped responding (main thread busy); where it's stuck:");
          timeline.push(...(await mainThreadStack(page)));
          throw new Error("The page froze while the scanner loaded");
        }
        if (!(await loading.isVisible())) break;
        // A slow read while the models start isn't the end of loading.
        const text = (await loading.textContent({ timeout: 5000 }).catch(() => null))?.trim() ?? lastText;
        if (text !== lastText) {
          mark(text);
          lastChange = Date.now();
        } else if (!sampled && Date.now() - lastChange > 30_000) {
          // Still answering but not moving: show what it's waiting in.
          sampled = true;
          mark("no progress for 30s; main thread right now:");
          timeline.push(...(await mainThreadStack(page)));
        }
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

      // What the scanner says while it works, so a miss shows where it gave up.
      const added = page.getByText(`Added ${target!.name}`).first();
      const addBy = Date.now() + ADD_TIMEOUT_MS;
      let lastSays = "";
      while (Date.now() < addBy && !(await added.isVisible())) {
        const says = (await page.locator("main").innerText().catch(() => ""))
          .replace(/\s+/g, " ")
          .replace(/Debug: what the scanner saw.*/, "")
          .slice(-400);
        if (says !== lastSays) mark(`page says: ${says}`);
        lastSays = says;
        await page.waitForTimeout(2000);
      }
      await expect(added, "the card was added").toBeVisible({ timeout: 1000 });
      mark(`added ${target!.name}`);
      const corners = await page
        .getByTestId("debug-corner")
        .allTextContents()
        .catch(() => []);
      if (corners.length) mark(`debug corner labels: ${corners.join(" ")}`);
      await expect(page.getByText(/Added this session: 1 card/)).toBeVisible();
    } finally {
      // textContent reads the debug panel even while it's folded shut.
      const debugTexts = await withTimeout(
        page
          .locator("details")
          .allTextContents()
          .then((texts) => texts.join("\n").replace(/[ \t]+/g, " ").slice(0, 3000))
          .catch(() => ""),
        5000,
      );
      // Pictures into the log, since the job's artifacts can't always be
      // fetched: the flattened card the scanner read, and the page.
      for (const [label, alt] of [
        ["flat-card", "Flattened card sent to the matcher"],
        ["loose-card", "Wider crop the text reader falls back to"],
        ["frame", "Camera frame the card came from"],
      ] as const) {
        const src = await withTimeout(
          page
            .locator(`img[alt="${alt}"]`)
            .first()
            .getAttribute("src", { timeout: 2000 })
            .catch(() => null),
          5000,
        );
        if (typeof src === "string") console.log(`E2E_IMAGE ${label} ${user.id} ${src}`);
      }
      const shot = await withTimeout(
        page.screenshot({ type: "jpeg", quality: 60 }).catch(() => null),
        10_000,
      );
      if (shot && shot !== "timeout") {
        console.log(`E2E_IMAGE page ${user.id} data:image/jpeg;base64,${shot.toString("base64")}`);
      }
      const debug = debugTexts === "timeout" ? "" : debugTexts;
      annotate("notice", `Scan timeline (${user.label})`, debug ? [...timeline, "", debug] : timeline);
      if (problems.length > 0) annotate("error", `Page problems (${user.label})`, [...new Set(problems)]);
      await browser.close().catch(() => undefined);
    }

    expect([...new Set(problems)], "no console errors or failed requests").toEqual([]);
  });
}
