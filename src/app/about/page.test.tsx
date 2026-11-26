/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";

import About from "./page";

const mockEnv: { NEXT_PUBLIC_DONATION_URL?: string } = { NEXT_PUBLIC_DONATION_URL: undefined };
jest.mock("~/env", () => ({
  get env() {
    return mockEnv;
  },
}));

describe("About page", () => {
  afterEach(() => {
    mockEnv.NEXT_PUBLIC_DONATION_URL = undefined;
  });

  test("tells the story under its headline", () => {
    render(<About />);

    expect(screen.getByRole("heading", { level: 1, name: "It always starts with a spreadsheet." })).toBeTruthy();
    expect(screen.getByText(/the thing we wanted instead of the spreadsheet/)).toBeTruthy();
  });

  test("links to the project board and issues", () => {
    render(<About />);

    expect(screen.getByRole("link", { name: "project board" }).getAttribute("href")).toBe(
      "https://github.com/users/mathewmorris/projects/2?pane=info",
    );
    expect(screen.getByRole("link", { name: "Open an issue on GitHub" }).getAttribute("href")).toBe(
      "https://github.com/mathewmorris/magic-vault/issues",
    );
  });

  test("credits Scryfall and shows the Fan Content Policy notice", () => {
    render(<About />);

    expect(screen.getAllByRole("link", { name: "Scryfall" })[0]?.getAttribute("href")).toBe(
      "https://scryfall.com",
    );
    expect(screen.getByText(/unofficial Fan Content permitted under the/i)).toBeTruthy();
    expect(screen.getByText(/Not approved\/endorsed by Wizards/i)).toBeTruthy();
  });

  test("leaves the support link out when no donation URL is set", () => {
    render(<About />);

    expect(screen.queryByRole("link", { name: /support magic vault/i })).toBeNull();
  });

  test("shows the support link when a donation URL is set", () => {
    mockEnv.NEXT_PUBLIC_DONATION_URL = "https://example.com/donate";
    render(<About />);

    expect(screen.getByRole("link", { name: /support magic vault/i }).getAttribute("href")).toBe(
      "https://example.com/donate",
    );
  });

  test("doesn't mention flagged-off features", () => {
    render(<About />);

    expect(screen.queryByText(/\bAI\b/)).toBeNull();
    expect(screen.queryByText(/affiliate/i)).toBeNull();
  });
});
