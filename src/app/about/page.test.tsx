/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";

import About from "./page";

jest.mock("~/env", () => ({ env: { NEXT_PUBLIC_DONATION_URL: undefined } }));

describe("About page", () => {
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

  test("doesn't mention flagged-off features", () => {
    render(<About />);

    expect(screen.queryByText(/\bAI\b/)).toBeNull();
    expect(screen.queryByText(/affiliate/i)).toBeNull();
  });
});
