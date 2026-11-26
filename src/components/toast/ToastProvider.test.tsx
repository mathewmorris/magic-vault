/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from "@testing-library/react";

import { ToastProvider } from "./ToastProvider";
import { DEFAULT_DURATIONS } from "./toastState";
import { useToast } from "./useToast";

function Trigger() {
  const toast = useToast();
  return (
    <>
      <button type="button" onClick={() => toast.success("Saved it")}>
        success
      </button>
      <button type="button" onClick={() => toast.error("Broke it")}>
        error
      </button>
      <button type="button" onClick={() => toast.info("FYI", { duration: 500 })}>
        info
      </button>
    </>
  );
}

function setup() {
  render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  );
}

describe("ToastProvider", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("shows a success toast as a polite status", () => {
    setup();
    fireEvent.click(screen.getByText("success"));

    const toast = screen.getByRole("status");
    expect(toast.textContent).toContain("Saved it");
    expect(toast.getAttribute("aria-live")).toBe("polite");
  });

  test("shows an error toast as an alert", () => {
    setup();
    fireEvent.click(screen.getByText("error"));

    const toast = screen.getByRole("alert");
    expect(toast.textContent).toContain("Broke it");
    expect(toast.getAttribute("aria-live")).toBe("assertive");
  });

  test("names the toast type for screen readers", () => {
    setup();
    fireEvent.click(screen.getByText("error"));

    expect(screen.getByText("Error:").className).toContain("sr-only");
  });

  test("stacks several toasts in one notifications region", () => {
    setup();
    fireEvent.click(screen.getByText("success"));
    fireEvent.click(screen.getByText("error"));

    const region = screen.getByRole("region", { name: "Notifications" });
    expect(region.textContent).toContain("Saved it");
    expect(region.textContent).toContain("Broke it");
  });

  test("auto-dismisses after its duration", () => {
    setup();
    fireEvent.click(screen.getByText("success"));

    act(() => {
      jest.advanceTimersByTime(DEFAULT_DURATIONS.success - 1);
    });
    expect(screen.queryByText("Saved it")).not.toBeNull();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByText("Saved it")).toBeNull();
  });

  test("honors a custom duration", () => {
    setup();
    fireEvent.click(screen.getByText("info"));

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(screen.queryByText("FYI")).toBeNull();
  });

  test("the close button dismisses right away", () => {
    setup();
    fireEvent.click(screen.getByText("success"));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));

    expect(screen.queryByText("Saved it")).toBeNull();
  });

  test("hovering pauses the countdown and leaving resumes it", () => {
    setup();
    fireEvent.click(screen.getByText("success"));
    const toast = screen.getByRole("status");

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    fireEvent.mouseEnter(toast);
    act(() => {
      jest.advanceTimersByTime(DEFAULT_DURATIONS.success * 2);
    });
    expect(screen.queryByText("Saved it")).not.toBeNull();

    fireEvent.mouseLeave(toast);
    act(() => {
      jest.advanceTimersByTime(DEFAULT_DURATIONS.success - 1000);
    });
    expect(screen.queryByText("Saved it")).toBeNull();
  });
});

describe("useToast", () => {
  test("throws outside a ToastProvider", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => render(<Trigger />)).toThrow(
      "useToast must be used inside a ToastProvider",
    );

    spy.mockRestore();
  });
});
