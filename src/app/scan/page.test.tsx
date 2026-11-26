/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";

import ScanPage from "./page";

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated" }),
}));

const mutation = { mutate: jest.fn(), reset: jest.fn(), isLoading: false, error: null };
jest.mock("~/utils/api", () => ({
  api: {
    useUtils: () => ({}),
    collection: {
      getAll: { useQuery: () => ({ data: undefined, isError: false }) },
      addCard: { useMutation: () => mutation },
      removeCard: { useMutation: () => mutation },
    },
  },
}));

jest.mock("~/components/CameraFeed", () => ({
  __esModule: true,
  default: function FakeCameraFeed({ captureLabel }: { captureLabel?: string }) {
    return <button type="button">{captureLabel ?? "Capture"}</button>;
  },
}));

// Stand-in for the AI scanner that can report itself unavailable.
jest.mock("~/components/scan/AiScanner", () => ({
  __esModule: true,
  default: function FakeAiScanner({ onUnavailable }: { onUnavailable: (notice: string) => void }) {
    return (
      <button type="button" onClick={() => onUnavailable("No image index yet.")}>
        Fake AI scanner
      </button>
    );
  },
}));

// Render dynamic() imports synchronously so the page's AI scanner is the mock above.
jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () =>
    function DynamicAiScanner(props: Record<string, unknown>) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
      const { default: Component } = jest.requireMock("~/components/scan/AiScanner");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return <Component {...props} />;
    },
}));

const FLAG = "NEXT_PUBLIC_FEATURE_AI_SCAN";

afterEach(() => {
  delete process.env[FLAG];
});

describe("/scan", () => {
  test("with the flag off it's the title-OCR scanner", () => {
    render(<ScanPage />);

    expect(screen.getByText(/with its name in the pink box/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Capture" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fake AI scanner" })).toBeNull();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe(
      "/api/auth/signin?callbackUrl=%2Fscan",
    );
  });

  test("with the flag on it's the AI scanner, falling back with a notice", () => {
    process.env[FLAG] = "true";

    render(<ScanPage />);

    expect(screen.getByText(/once the outline locks on/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fake AI scanner" }));

    expect(screen.getByRole("status").textContent).toBe("No image index yet.");
    expect(screen.getByText(/with its name in the pink box/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Capture" })).toBeTruthy();
  });
});
