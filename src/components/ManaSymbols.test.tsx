/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";

import ManaSymbols from "./ManaSymbols";

describe("ManaSymbols", () => {
  test("draws each symbol as a Scryfall SVG with the token as alt text", () => {
    render(<ManaSymbols cost="{2}{W/U}" />);

    const two = screen.getByAltText("{2}");
    const hybrid = screen.getByAltText("{W/U}");
    expect(two.getAttribute("src")).toBe("https://svgs.scryfall.io/card-symbols/2.svg");
    expect(hybrid.getAttribute("src")).toBe("https://svgs.scryfall.io/card-symbols/WU.svg");
  });

  test("keeps the separator between split card halves as text", () => {
    const { container } = render(<ManaSymbols cost="{R} // {U}" />);

    expect(container.textContent).toBe(" // ");
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  test("renders nothing for an empty cost", () => {
    const { container } = render(<ManaSymbols cost="" />);

    expect(container.innerHTML).toBe("");
  });
});
