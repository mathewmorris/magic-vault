/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";

import Spinner from "./Spinner";

describe("Spinner", () => {
  test("renders a status region with a default Loading label", () => {
    render(<Spinner />);

    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Loading");
    expect(screen.getByText("Loading").className).toContain("sr-only");
  });

  test("uses a custom label when one is passed", () => {
    render(<Spinner label="Loading collections" />);

    expect(screen.getByRole("status").textContent).toBe("Loading collections");
  });
});
