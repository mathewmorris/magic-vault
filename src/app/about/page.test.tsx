/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";

import About from "./page";

const mockEnv: { NEXT_PUBLIC_DONATION_URL?: string } = {};

// A getter, so the mock reads mockEnv when the page renders, not when it loads.
jest.mock("~/env", () => ({
  get env() {
    return mockEnv;
  },
}));

describe("About page", () => {
  beforeEach(() => {
    delete mockEnv.NEXT_PUBLIC_DONATION_URL;
  });

  test("credits Scryfall and shows the Fan Content Policy notice", () => {
    render(<About />);

    expect(screen.getAllByRole("link", { name: "Scryfall" })[0]?.getAttribute("href")).toBe(
      "https://scryfall.com",
    );
    expect(screen.getByText(/unofficial Fan Content permitted under the/i)).toBeTruthy();
    expect(screen.getByText(/Not approved\/endorsed by Wizards/i)).toBeTruthy();
  });

  test("links to the project board and the issue tracker", () => {
    render(<About />);

    expect(screen.getByRole("link", { name: "project board" }).getAttribute("href")).toBe(
      "https://github.com/users/mathewmorris/projects/2?pane=info",
    );
    expect(screen.getByRole("link", { name: "Open an issue on GitHub" }).getAttribute("href")).toBe(
      "https://github.com/mathewmorris/magic-vault/issues",
    );
  });

  test("lists the features as oracle text and the deck formats as legalities", () => {
    render(<About />);

    expect(screen.getByText("Search Every Card.")).toBeTruthy();
    expect(screen.getByText("Commander")).toBeTruthy();
    expect(screen.getByText("Pauper")).toBeTruthy();
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
