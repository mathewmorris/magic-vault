/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";

import SupportLink from "./SupportLink";

describe("SupportLink", () => {
  test("renders nothing when no URL is set", () => {
    const { container } = render(<SupportLink />);

    expect(container.firstChild).toBeNull();
  });

  test("renders nothing when the URL is blank", () => {
    const { container } = render(<SupportLink href="   " />);

    expect(container.firstChild).toBeNull();
  });

  test("renders a new-tab link to the donation URL when set", () => {
    render(<SupportLink href="https://example.com/test" />);

    const link = screen.getByRole("link", { name: /support magic vault/i });
    expect(link.getAttribute("href")).toBe("https://example.com/test");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
