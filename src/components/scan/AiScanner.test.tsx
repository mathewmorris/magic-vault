/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";

import type { ScanCard } from "~/server/api/routers/scan";
import type { Detection } from "~/utils/recognition/browser/detector";
import type { CardCapture } from "~/utils/recognition/browser/pipeline";
import { EMBED_MODEL } from "~/utils/recognition/model";
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

jest.mock("~/components/CameraFeed", () => ({
  __esModule: true,
  default: function FakeCameraFeed(props: {
    onCapture: (frame: HTMLCanvasElement) => void;
    onReady?: (size: { width: number; height: number }) => void;
    onFrameSource?: (grab: (() => HTMLCanvasElement | null) | null) => void;
    overlay?: React.ReactNode;
    disabled?: boolean;
    captureLabel?: string;
  }) {
    const { onReady, onFrameSource } = props;
    useEffect(() => {
      onReady?.({ width: 640, height: 480 });
      onFrameSource?.(() => mockCanvas);
      return () => onFrameSource?.(null);
    }, [onReady, onFrameSource]);
    return (
      <div>
        {props.overlay}
        <button type="button" disabled={props.disabled} onClick={() => props.onCapture(mockCanvas)}>
          {props.captureLabel ?? "Capture"}
        </button>
      </div>
    );
  },
}));

jest.mock("~/utils/recognition/browser/frame", () => ({
  canvasToRgba: () => ({ data: new Uint8ClampedArray(4), width: 640, height: 480 }),
  rgbaToCanvas: () => ({}),
  rgbaToDataUrl: () => "data:image/png;base64,AAAA",
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
  collector: { collectorNumber: "149", setCode: "m11", lang: "en", rarity: "C", total: "249" },
  rawTitle: "Lightning Bolt R",
  rawCollector: "149/249 C\nM11 • EN",
};

const FAST: Partial<ScannerTiming> = { tickMs: 10, stableMs: 40, burstGapMs: 1, burstSize: 3 };

const readyStatus: StatusResult = {
  data: { enabled: true, modelId: EMBED_MODEL.id, indexed: 30000 },
  isLoading: false,
  isError: false,
};

const mockAdd = jest.fn();

function Harness({ onUnavailable = jest.fn() }: { onUnavailable?: (notice: string) => void }) {
  const [addedName, setAddedName] = useState<string | null>(null);
  const scan = {
    auth: "signed-in",
    signInUrl: "/api/auth/signin",
    collectionName: "Burn",
    adding: false,
    addError: null,
    addedName,
    add: (match: { id: string; name: string }) => {
      mockAdd(match);
      setAddedName(match.name);
    },
    clearAdded: () => setAddedName(null),
  } as unknown as ScanCollection;
  return <AiScanner scan={scan} onUnavailable={onUnavailable} timing={FAST} />;
}

const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

beforeEach(() => {
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
  test("shows a loading message while the models download", async () => {
    mockState.detectorLoad = () => new Promise(() => undefined); // never finishes

    render(<Harness />);

    expect((await screen.findByRole("status")).textContent).toMatch(
      /Loading the card scanner \(about 12 MB, once\)/,
    );
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Capture" }).disabled).toBe(true);
  });

  test("waits for the server status before loading anything", () => {
    mockState.status = { isLoading: true, isError: false };

    render(<Harness />);

    expect(screen.getByText("Checking the card scanner...")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Capture" })).toBeNull();
  });

  test("falls back when the server has no image index yet", async () => {
    mockState.status = {
      data: { enabled: true, modelId: EMBED_MODEL.id, indexed: 0 },
      isLoading: false,
      isError: false,
    };
    const onUnavailable = jest.fn();
    const detectorLoad = jest.fn(() => new Promise(() => undefined));
    mockState.detectorLoad = detectorLoad;

    render(<Harness onUnavailable={onUnavailable} />);

    await waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1));
    expect(onUnavailable).toHaveBeenCalledWith(expect.stringMatching(/reads card names instead/));
    expect(detectorLoad).not.toHaveBeenCalled();
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

  test("a capture shows the ranked matches with which printing each is", async () => {
    render(<Harness />);

    const captureButton = await screen.findByRole<HTMLButtonElement>("button", { name: "Capture" });
    await waitFor(() => expect(captureButton.disabled).toBe(false));
    fireEvent.click(captureButton);

    // The OCR'd set and number pick the M11 printing over the 2XM one.
    const top = await screen.findByRole("button", { name: /Lightning Bolt M11 #149 · EN/ });
    expect(top.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Lightning Bolt 2XM #141 · EN/ })).toBeTruthy();
    expect(screen.getByText("Pretty sure about this one.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      'Best matches for "Lightning Bolt"',
    );

    expect(mockCaptureCard).toHaveBeenCalledTimes(1);
    const [frames, , options] = mockCaptureCard.mock.calls[0] as [unknown[], unknown, unknown];
    expect(frames).toHaveLength(3);
    expect(options).toEqual({ allowGuideFallback: true });
    expect(mockFetch).toHaveBeenCalledWith({
      embedding: [0.6, 0.8],
      modelId: EMBED_MODEL.id,
      limit: 20,
      printing: { set: "m11", collectorNumber: "149" },
    });

    // Debug panel shows what was seen.
    expect(screen.getByAltText("Flattened card sent to the matcher")).toBeTruthy();
    expect(screen.getByText(/Raw collector OCR/).textContent).toContain("M11");
  });

  test("skips the printing lookup when OCR didn't read a set and number", async () => {
    mockOcrRead.mockResolvedValue({ ...boltOcr, collector: null });

    render(<Harness />);

    const captureButton = await screen.findByRole<HTMLButtonElement>("button", { name: "Capture" });
    await waitFor(() => expect(captureButton.disabled).toBe(false));
    fireEvent.click(captureButton);

    await screen.findByRole("button", { name: /Lightning Bolt 2XM/ });
    expect(mockFetch).toHaveBeenCalledWith(expect.objectContaining({ printing: undefined }));
  });

  test("says so when no card was found in the picture", async () => {
    mockCaptureCard.mockResolvedValue(null);

    render(<Harness />);

    const captureButton = await screen.findByRole<HTMLButtonElement>("button", { name: "Capture" });
    await waitFor(() => expect(captureButton.disabled).toBe(false));
    fireEvent.click(captureButton);

    expect(await screen.findByText(/Couldn't find a card in the picture/)).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("draws the outline, auto captures once it holds still, and doesn't re-add after an add", async () => {
    mockState.detection = { quad, score: 0.95, source: "opencv" };

    render(<Harness />);

    expect(await screen.findByTestId("card-outline")).toBeTruthy();
    await screen.findByRole("button", { name: /Lightning Bolt M11 #149/ });
    expect(mockCaptureCard).toHaveBeenCalledTimes(1);
    expect((mockCaptureCard.mock.calls[0] as unknown[])[2]).toEqual({ allowGuideFallback: false });

    fireEvent.click(screen.getByRole("button", { name: "Add Lightning Bolt to Burn" }));
    expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ id: "bolt-m11" }));
    expect(screen.getByRole("status").textContent).toBe("Added Lightning Bolt to Burn.");

    // The card is still sitting there, still: no new capture.
    await wait(200);
    expect(mockCaptureCard).toHaveBeenCalledTimes(1);

    // It leaves, and the same card is put back: captured again, but it's the
    // same top match, so the "Added" state stays and nothing invites a re-add.
    mockState.detection = null;
    await wait(120);
    mockState.detection = { quad, score: 0.95, source: "opencv" };
    await waitFor(() => expect(mockCaptureCard).toHaveBeenCalledTimes(2));
    await wait(30);
    expect(screen.getByRole("status").textContent).toBe("Added Lightning Bolt to Burn.");
    expect(mockAdd).toHaveBeenCalledTimes(1);

    // A different card: new results replace the old ones.
    mockFetch.mockResolvedValue({ matches: [{ card: shock, face: 0, similarity: 0.9 }], printing: null });
    mockOcrRead.mockResolvedValue({ ...boltOcr, name: "Shock", collector: null });
    mockState.detection = null;
    await wait(120);
    mockState.detection = { quad, score: 0.95, source: "opencv" };
    expect(await screen.findByRole("button", { name: "Add Shock to Burn" })).toBeTruthy();
    expect(mockCaptureCard).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole("button", { name: /Lightning Bolt/ })).toBeNull();
  });

  test("auto capture can be turned off", async () => {
    mockState.detection = { quad, score: 0.95, source: "opencv" };

    render(<Harness />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Auto capture" }));
    expect(await screen.findByTestId("card-outline")).toBeTruthy();
    await wait(200);
    expect(mockCaptureCard).not.toHaveBeenCalled();
  });
});
