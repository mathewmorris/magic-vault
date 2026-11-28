/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useState } from "react";

import type { ScanCard } from "~/server/api/routers/scan";
import type { Detection } from "~/utils/recognition/browser/detector";
import type { CardCapture } from "~/utils/recognition/browser/pipeline";
import { EMBED_MODEL } from "~/utils/recognition/model";
import { MAX_SCAN_ATTEMPTS } from "~/utils/recognition/scanLoop";
import { LOCK_VIBRATION_MS } from "~/utils/scan/lockSignal";
import type { CardOcrResult } from "~/utils/recognition/ocr";
import type { ScanCollection } from "~/utils/scan/useScanCollection";
import AiScanner, { type ScannerTiming } from "./AiScanner";

// ---- Mocks for everything heavy: camera, models, OCR, server. ----

type StatusResult = {
  data?: { enabled: boolean; modelId: string; indexed: number };
  isLoading: boolean;
  isError: boolean;
};

const mockState = {
  status: { isLoading: false, isError: false } as StatusResult,
  detection: null as Detection | null,
  detectorLoad: null as (() => Promise<unknown>) | null,
};
const mockFetch = jest.fn();
const mockCaptureCard = jest.fn();
const mockOcrRead = jest.fn();

jest.mock("~/utils/api", () => ({
  api: {
    useUtils: () => ({ scan: { match: { fetch: mockFetch } } }),
    scan: { status: { useQuery: () => mockState.status } },
  },
}));

const mockCanvas = { width: 640, height: 480 } as HTMLCanvasElement;
const mockGrab = jest.fn((_maxSide?: number) => mockCanvas);

jest.mock("~/components/CameraFeed", () => ({
  __esModule: true,
  default: function FakeCameraFeed(props: {
    onReady?: (size: { width: number; height: number }) => void;
    onFrameSource?: (grab: ((maxSide?: number) => HTMLCanvasElement | null) | null) => void;
    overlay?: React.ReactNode;
    showCaptureButton?: boolean;
  }) {
    const { onReady, onFrameSource } = props;
    useEffect(() => {
      onReady?.({ width: 640, height: 480 });
      onFrameSource?.(mockGrab);
      return () => onFrameSource?.(null);
    }, [onReady, onFrameSource]);
    return (
      <div>
        {props.overlay}
        {props.showCaptureButton !== false && <button type="button">Capture</button>}
      </div>
    );
  },
}));

const mockCanvasToRgba = jest.fn((_canvas: unknown, _maxSide?: number) => ({
  data: new Uint8ClampedArray(4),
  width: 640,
  height: 480,
}));
const mockDataUrl = jest.fn(() => "data:image/png;base64,AAAA");

jest.mock("~/utils/recognition/browser/frame", () => ({
  canvasToRgba: (canvas: unknown, maxSide?: number) => mockCanvasToRgba(canvas, maxSide),
  rgbaToCanvas: () => ({}),
  rgbaToDataUrl: () => mockDataUrl(),
}));

jest.mock("~/utils/recognition/browser/detector", () => ({
  createCardDetector: () =>
    mockState.detectorLoad
      ? mockState.detectorLoad()
      : Promise.resolve({
          kinds: ["opencv"],
          detect: () => Promise.resolve(mockState.detection),
          dispose: () => undefined,
        }),
  guideDetection: () => null,
}));

jest.mock("~/utils/recognition/browser/embedder", () => ({
  createEmbedder: () =>
    Promise.resolve({ modelId: "test", embed: () => Promise.resolve([1, 0]), dispose: () => undefined }),
  embedBurst: () => Promise.resolve([0.6, 0.8]),
}));

jest.mock("~/utils/recognition/browser/pipeline", () => ({
  captureCard: (...args: unknown[]) => mockCaptureCard(...args) as Promise<unknown>,
}));

jest.mock("~/utils/recognition/ocr", () => ({
  createCardOcr: () =>
    Promise.resolve({
      read: (...args: unknown[]) => mockOcrRead(...args) as Promise<unknown>,
      terminate: () => Promise.resolve(),
    }),
}));

// ---- Test data ----

function card(id: string, name: string, set: string, number: string): ScanCard {
  return {
    id,
    name,
    set,
    set_name: set.toUpperCase(),
    collector_number: number,
    lang: "en",
    rarity: "common",
    layout: "normal",
    image_uris: null,
    card_faces: null,
  };
}

const bolt = card("bolt-m11", "Lightning Bolt", "m11", "149");
const bolt2xm = card("bolt-2xm", "Lightning Bolt", "2xm", "141");
const shock = card("shock-m21", "Shock", "m21", "159");

const quad: Detection["quad"] = [
  { x: 100, y: 50 },
  { x: 300, y: 50 },
  { x: 300, y: 330 },
  { x: 100, y: 330 },
];

const flatCard = { data: new Uint8ClampedArray(4), width: 488, height: 680 };
const capture: CardCapture = {
  detection: { quad, score: 0.9, source: "opencv" },
  cards: [flatCard, flatCard],
  best: flatCard,
};

const boltOcr: CardOcrResult = {
  name: "Lightning Bolt",
  collector: {
    collectorNumber: "149",
    setCode: "m11",
    lang: "en",
    rarity: "C",
    total: "249",
    foilMark: "nonfoil",
  },
  rawTitle: "Lightning Bolt R",
  rawCollector: "149/249 C\nM11 • EN",
};

const FAST: Partial<ScannerTiming> = {
  tickMs: 10,
  stableMs: 40,
  burstGapMs: 1,
  burstSize: 3,
  missesToLeave: 3,
  noCardMs: 100,
  flashMs: 50,
};

const readyStatus: StatusResult = {
  data: { enabled: true, modelId: EMBED_MODEL.id, indexed: 30000 },
  isLoading: false,
  isError: false,
};

const mockAdd = jest.fn();
const mockUndo = jest.fn();

type HarnessProps = {
  onUnavailable?: (notice: string) => void;
  debug?: boolean;
  auth?: "signed-in" | "signed-out" | "loading";
  collectionName?: string | null;
};

/** A stand-in for useScanCollection: adds and undoes instantly. */
function Harness({ onUnavailable = jest.fn(), debug, auth = "signed-in", collectionName = "Burn" }: HarnessProps) {
  const [addedName, setAddedName] = useState<string | null>(null);
  const [added, setAdded] = useState<{ cardId: string; name: string }[]>([]);
  const scan = {
    auth,
    signInUrl: "/api/auth/signin",
    collectionName,
    adding: false,
    addError: null,
    undoing: false,
    undoError: null,
    addedName,
    added,
    add: (match: { id: string; name: string }) => {
      mockAdd(match);
      setAdded((list) => [...list, { cardId: match.id, name: match.name }]);
      setAddedName(match.name);
    },
    undo: () => {
      mockUndo(added[added.length - 1]);
      setAdded((list) => list.slice(0, -1));
      setAddedName(null);
    },
    clearAdded: () => setAddedName(null),
  } as unknown as ScanCollection;
  return <AiScanner scan={scan} onUnavailable={onUnavailable} timing={FAST} debug={debug} />;
}

const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

// ---- Vibration and Web Audio ----

const mockVibrate = jest.fn(() => true);
const mockTones: number[] = [];

class FakeAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  resume() {
    return Promise.resolve();
  }
  createOscillator() {
    return {
      type: "sine",
      frequency: { setValueAtTime: (hz: number) => void mockTones.push(hz) },
      connect: () => undefined,
      start: () => undefined,
      stop: () => undefined,
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined },
      connect: () => undefined,
    };
  }
}

const shockOcr: CardOcrResult = {
  name: "Shock",
  collector: {
    collectorNumber: "159",
    setCode: "m21",
    lang: "en",
    rarity: "C",
    total: "274",
    foilMark: "nonfoil",
  },
  rawTitle: "Shock",
  rawCollector: "159/274 C\nM21 • EN",
};

/** Two Bolt printings with the same art and no collector line read: not sure which. */
function makeUnsure() {
  mockOcrRead.mockResolvedValue({ ...boltOcr, collector: null });
  mockFetch.mockResolvedValue({
    matches: [
      { card: bolt2xm, face: 0, similarity: 0.84 },
      { card: bolt, face: 0, similarity: 0.83 },
    ],
    printing: null,
  });
}

/** The next card in view is a Shock, read clearly. */
function makeShock() {
  mockOcrRead.mockResolvedValue(shockOcr);
  mockFetch.mockResolvedValue({ matches: [{ card: shock, face: 0, similarity: 0.9 }], printing: shock });
}

const cardInView = () => {
  mockState.detection = { quad, score: 0.95, source: "opencv" };
};
const cardGone = () => {
  mockState.detection = null;
};
/** The outline jumps (more than swapDistance) without the card leaving. */
const cardNudged = () => {
  mockState.detection = {
    quad: quad.map((p) => ({ x: p.x + 200, y: p.y })) as Detection["quad"],
    score: 0.95,
    source: "opencv",
  };
};

const lockedName = () => screen.queryByTestId("locked-name")?.textContent ?? null;

beforeEach(() => {
  jest.clearAllMocks();
  mockTones.length = 0;
  window.localStorage.clear();
  (navigator as unknown as { vibrate?: unknown }).vibrate = mockVibrate;
  (window as unknown as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
  mockState.status = readyStatus;
  mockState.detection = null;
  mockState.detectorLoad = null;
  mockCaptureCard.mockResolvedValue(capture);
  mockOcrRead.mockResolvedValue(boltOcr);
  mockFetch.mockResolvedValue({
    matches: [
      { card: bolt2xm, face: 0, similarity: 0.84 },
      { card: bolt, face: 0, similarity: 0.83 },
      { card: shock, face: 0, similarity: 0.4 },
    ],
    printing: bolt,
  });
});

describe("AiScanner", () => {
  test("shows a loading message while the models download, with no Capture button", async () => {
    mockState.detectorLoad = () => new Promise(() => undefined); // never finishes

    render(<Harness />);

    expect((await screen.findByRole("status")).textContent).toMatch(
      /Loading the card scanner \(about 12 MB, once\)/,
    );
    expect(screen.queryByRole("button", { name: "Capture" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Scan now" })).toBeNull();
  });

  test("waits for the server status before loading anything", () => {
    mockState.status = { isLoading: true, isError: false };

    render(<Harness />);

    expect(screen.getByText("Checking the card scanner...")).toBeTruthy();
  });

  test("still scans by the printed text when the server has no image index yet", async () => {
    mockState.status = {
      data: { enabled: true, modelId: EMBED_MODEL.id, indexed: 0 },
      isLoading: false,
      isError: false,
    };
    const onUnavailable = jest.fn();
    const detectorLoad = jest.fn(() => new Promise(() => undefined));
    mockState.detectorLoad = detectorLoad;

    render(<Harness onUnavailable={onUnavailable} />);

    await waitFor(() => expect(detectorLoad).toHaveBeenCalled());
    expect(screen.getByText(/No card pictures are indexed yet/)).toBeTruthy();
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  test("falls back when the index was built with another model", async () => {
    mockState.status = {
      data: { enabled: true, modelId: "some-older-model", indexed: 500 },
      isLoading: false,
      isError: false,
    };
    const onUnavailable = jest.fn();

    render(<Harness onUnavailable={onUnavailable} />);

    await waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1));
  });

  test("falls back when the detector can't load", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockState.detectorLoad = () => Promise.reject(new Error("WebAssembly is not supported"));
    const onUnavailable = jest.fn();

    render(<Harness onUnavailable={onUnavailable} />);

    await waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1));
    expect(onUnavailable).toHaveBeenCalledWith(expect.stringMatching(/didn't load/));
  });

  test("a confident scan locks on, signals and adds the card by itself", async () => {
    cardInView();
    render(<Harness />);
    // A tap anywhere on the scanner lets the browser play sound.
    fireEvent.pointerDown(await screen.findByText("Auto add when sure"));

    await waitFor(() => expect(lockedName()).toBe("Lightning Bolt"));
    // The OCR'd set and number pick the M11 printing over the 2XM one.
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ id: "bolt-m11", name: "Lightning Bolt" }));
    expect(within(screen.getByTestId("lock-banner")).getByText("M11 #149 · EN")).toBeTruthy();
    expect(screen.getByText("Added Lightning Bolt to Burn.")).toBeTruthy();

    // The signal: a buzz, a two-note chime and a green flash.
    expect(mockVibrate).toHaveBeenCalledWith(LOCK_VIBRATION_MS);
    expect(mockTones).toHaveLength(2);
    expect(screen.getByTestId("lock-flash")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("lock-flash")).toBeNull());

    // No matches list to pick from: it was sure.
    expect(screen.queryByRole("button", { name: /Lightning Bolt 2XM/ })).toBeNull();

    expect(mockCaptureCard).toHaveBeenCalledTimes(1);
    const [frames, , options] = mockCaptureCard.mock.calls[0] as [unknown[], unknown, unknown];
    expect(frames).toHaveLength(3);
    expect(options).toEqual({ allowGuideFallback: false });
    expect(mockFetch).toHaveBeenCalledWith({
      embedding: [0.6, 0.8],
      modelId: EMBED_MODEL.id,
      limit: 20,
      printing: { set: "m11", collectorNumber: "149" },
    });
  });

  test("keeps no photo: no data URL is made outside the debug view", async () => {
    cardInView();
    render(<Harness />);

    await waitFor(() => expect(lockedName()).toBe("Lightning Bolt"));
    expect(mockDataUrl).not.toHaveBeenCalled();
    expect(screen.queryByAltText("Flattened card sent to the matcher")).toBeNull();
  });

  test("live frames are grabbed small, and captures only as big as the card needs", async () => {
    cardInView();
    render(<Harness />);

    await waitFor(() => expect(lockedName()).toBe("Lightning Bolt"));
    const sizes = mockGrab.mock.calls.map((call) => call[0]);
    expect(sizes).toContain(640);
    // The card is 280 px tall in a 640 px wide frame: small, so full size.
    expect(sizes).toContain(1280);
    expect(mockCanvasToRgba).toHaveBeenCalledWith(mockCanvas, 1280);
  });

  test("the same card sitting there, or nudged, is never added twice", async () => {
    cardInView();
    render(<Harness />);
    await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(1));

    // Still sitting there: no new scan.
    await wait(200);
    expect(mockCaptureCard).toHaveBeenCalledTimes(1);

    // Nudged across the frame without leaving it: scanned again, same card,
    // nothing added.
    cardNudged();
    await waitFor(() => expect(mockCaptureCard).toHaveBeenCalledTimes(2));
    await wait(50);
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Added Lightning Bolt to Burn.")).toBeTruthy();
  });

  test("once the card leaves, the next card is scanned and added", async () => {
    cardInView();
    render(<Harness />);
    await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(1));

    cardGone();
    await wait(100);
    // The last add stays on screen (with Undo) while waiting for the next card.
    expect(lockedName()).toBe("Lightning Bolt");

    makeShock();
    cardInView();
    await waitFor(() => expect(lockedName()).toBe("Shock"));
    expect(mockAdd).toHaveBeenCalledTimes(2);
    expect(mockAdd).toHaveBeenLastCalledWith(expect.objectContaining({ id: "shock-m21" }));
    expect(screen.getByText("Added Shock to Burn.")).toBeTruthy();
    expect(mockVibrate).toHaveBeenCalledTimes(2);
  });

  test("another copy of the same card, put down after the first was taken away, is added too", async () => {
    cardInView();
    render(<Harness />);
    await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(1));

    cardGone();
    await wait(100);
    cardInView();
    await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(2));
    expect(mockAdd).toHaveBeenLastCalledWith(expect.objectContaining({ id: "bolt-m11" }));
  });

  test("not sure: looks again a few times, then shows the matches to pick from", async () => {
    makeUnsure();
    cardInView();
    render(<Harness />);

    await screen.findByText(/Not sure about this one/);
    expect(mockCaptureCard).toHaveBeenCalledTimes(MAX_SCAN_ATTEMPTS);
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockVibrate).not.toHaveBeenCalled();
    expect(lockedName()).toBeNull();

    const top = screen.getByRole("button", { name: /Lightning Bolt 2XM #141 · EN/ });
    expect(top.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Lightning Bolt M11 #149 · EN/ })).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledWith(expect.objectContaining({ printing: undefined }));

    // It gave up on this card: no more scans while it sits there.
    await wait(150);
    expect(mockCaptureCard).toHaveBeenCalledTimes(MAX_SCAN_ATTEMPTS);

    // The user picks and adds it by hand.
    fireEvent.click(screen.getByRole("button", { name: /Lightning Bolt M11 #149/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add Lightning Bolt to Burn" }));
    expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ id: "bolt-m11" }));
  });

  test("unsure at first, sure on a second look: locks and adds once", async () => {
    mockOcrRead.mockResolvedValueOnce({ ...boltOcr, collector: null });
    mockFetch.mockResolvedValueOnce({
      matches: [
        { card: bolt2xm, face: 0, similarity: 0.84 },
        { card: bolt, face: 0, similarity: 0.83 },
      ],
      printing: null,
    });
    cardInView();
    render(<Harness />);

    await waitFor(() => expect(lockedName()).toBe("Lightning Bolt"));
    expect(mockCaptureCard).toHaveBeenCalledTimes(2);
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Not sure about this one/)).toBeNull();
  });

  test("Undo takes the copy back out and shows the matches to pick the right one", async () => {
    cardInView();
    render(<Harness />);
    await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(mockUndo).toHaveBeenCalledTimes(1);
    expect(mockUndo).toHaveBeenCalledWith(expect.objectContaining({ cardId: "bolt-m11" }));
    expect(screen.getByText(/Took it back out/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(screen.getByRole("button", { name: /Lightning Bolt 2XM #141/ })).toBeTruthy();

    // The card is still there: it isn't scanned and added again by itself.
    await wait(150);
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });

  test("Rescan takes the copy back out and looks at the card in view again", async () => {
    cardInView();
    render(<Harness />);
    await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(1));

    makeShock(); // this time it reads as a Shock
    fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
    expect(mockUndo).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(lockedName()).toBe("Shock"));
    expect(mockCaptureCard).toHaveBeenCalledTimes(2);
    expect(mockAdd).toHaveBeenCalledTimes(2);
    expect(mockAdd).toHaveBeenLastCalledWith(expect.objectContaining({ id: "shock-m21" }));
  });

  test("Rescan from the matches list tries the card again", async () => {
    makeUnsure();
    cardInView();
    render(<Harness />);
    await screen.findByText(/Not sure about this one/);
    expect(mockCaptureCard).toHaveBeenCalledTimes(MAX_SCAN_ATTEMPTS);

    mockOcrRead.mockResolvedValue(boltOcr);
    mockFetch.mockResolvedValue({ matches: [{ card: bolt, face: 0, similarity: 0.9 }], printing: bolt });
    fireEvent.click(screen.getByRole("button", { name: "Rescan" }));

    await waitFor(() => expect(lockedName()).toBe("Lightning Bolt"));
    expect(mockCaptureCard).toHaveBeenCalledTimes(MAX_SCAN_ATTEMPTS + 1);
    expect(mockUndo).not.toHaveBeenCalled();
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });

  test("signed out: locks onto the card and selects it, but adds nothing", async () => {
    cardInView();
    render(<Harness auth="signed-out" />);

    await waitFor(() => expect(lockedName()).toBe("Lightning Bolt"));
    expect(mockVibrate).toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Lightning Bolt M11 #149/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  test("signed in with no collection: adds nothing", async () => {
    cardInView();
    render(<Harness collectionName={null} />);

    await waitFor(() => expect(lockedName()).toBe("Lightning Bolt"));
    expect(mockAdd).not.toHaveBeenCalled();
    expect(screen.getByText("Pick or create a collection to add this card.")).toBeTruthy();
  });

  test("with Auto add off it locks and waits for Add, and remembers the setting", async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Auto add when sure" }));
    expect(window.localStorage.getItem("magic-vault:scan:auto-add")).toBe("off");
    cardInView();

    await waitFor(() => expect(lockedName()).toBe("Lightning Bolt"));
    expect(mockAdd).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add Lightning Bolt to Burn" }));
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });

  test("the Auto add and Sound settings start from what was remembered", async () => {
    window.localStorage.setItem("magic-vault:scan:auto-add", "off");
    window.localStorage.setItem("magic-vault:scan:sound", "off");
    render(<Harness />);

    expect((await screen.findByRole<HTMLInputElement>("checkbox", { name: "Auto add when sure" })).checked).toBe(
      false,
    );
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "Sound" }).checked).toBe(false);
  });

  test("with Sound off it still buzzes and flashes, but plays no chime", async () => {
    render(<Harness />);
    const sound = await screen.findByRole("checkbox", { name: "Sound" });
    fireEvent.pointerDown(sound);
    fireEvent.click(sound);
    expect(window.localStorage.getItem("magic-vault:scan:sound")).toBe("off");
    cardInView();

    await waitFor(() => expect(lockedName()).toBe("Lightning Bolt"));
    expect(mockVibrate).toHaveBeenCalled();
    expect(mockTones).toHaveLength(0);
  });

  test("offers Scan now when no card outline shows up for a while", async () => {
    render(<Harness />);

    const scanNow = await screen.findByRole("button", { name: "Scan now" });
    fireEvent.click(scanNow);

    await waitFor(() => expect(lockedName()).toBe("Lightning Bolt"));
    expect((mockCaptureCard.mock.calls[0] as unknown[])[2]).toEqual({ allowGuideFallback: true });
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });

  test("Scan now says so when there's no card in the picture", async () => {
    mockCaptureCard.mockResolvedValue(null);
    render(<Harness />);

    fireEvent.click(await screen.findByRole("button", { name: "Scan now" }));

    expect(await screen.findByText(/Couldn't find a card in the picture/)).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("debug mode is off by default: no corner overlay or debug panel", async () => {
    cardInView();
    render(<Harness />);

    expect(await screen.findByTestId("card-outline")).toBeTruthy();
    expect(screen.queryByTestId("debug-overlay")).toBeNull();
    await waitFor(() => expect(lockedName()).toBe("Lightning Bolt"));
    expect(screen.queryByText("Debug: what the scanner saw")).toBeNull();
  });

  test("debug mode labels the raw corners with the detector and its score", async () => {
    mockState.detection = { quad, score: 0.87, source: "pose" };

    render(<Harness debug />);

    await waitFor(() => expect(screen.getByTestId("debug-detector").textContent).toMatch(/^pose 0\.87/));
    const overlay = screen.getByTestId("debug-overlay");
    for (const label of ["TL", "TR", "BR", "BL"]) expect(within(overlay).getByText(label)).toBeTruthy();

    mockState.detection = null;
    await waitFor(() => expect(screen.getByTestId("debug-detector").textContent).toBe("no card"));
    expect(within(overlay).queryByText("TL")).toBeNull();
  });

  test("the debug panel shows the flattened card and breaks the top candidates down signal by signal", async () => {
    cardInView();
    render(<Harness debug />);
    await waitFor(() => expect(lockedName()).toBe("Lightning Bolt"));

    expect(screen.getByAltText("Flattened card sent to the matcher")).toBeTruthy();
    expect(screen.getByText(/Raw collector OCR/).textContent).toContain("M11");
    expect(screen.getByText(/Ranking:/).textContent).toContain("confident");

    const breakdown = screen.getByTestId("debug-signals");
    const candidates = within(breakdown).getAllByTestId("debug-candidate");
    expect(candidates).toHaveLength(3);

    // Top pick: the M11 Bolt, with each cue it was judged on.
    const top = candidates[0]!;
    expect(top.textContent).toContain("M11 #149");
    expect(top.textContent).toMatch(/finish nonfoil/);
    const rows = within(top)
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent));
    expect(rows.map((cells) => cells[0])).toEqual(["image", "name", "collector", "rarity"]);
    const collectorRow = rows.find((cells) => cells[0] === "collector")!;
    expect(collectorRow[1]).toBe("1.00");
    expect(collectorRow[3]).toMatch(/m11 #149 matches/);
  });
});
