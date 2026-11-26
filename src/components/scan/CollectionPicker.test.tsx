/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";

import CollectionPicker, { collectionLabel } from "./CollectionPicker";

describe("CollectionPicker", () => {
  const collections = [
    { id: "burn", name: "Burn" },
    { id: "binder", name: null },
  ];

  test("lists the collections with the current one selected", () => {
    render(<CollectionPicker collections={collections} value="binder" onChange={jest.fn()} />);

    const select = screen.getByRole<HTMLSelectElement>("combobox", { name: "Add cards to" });
    expect(select.value).toBe("binder");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Burn",
      "Untitled collection",
    ]);
  });

  test("reports a new choice", () => {
    const onChange = jest.fn();
    render(<CollectionPicker collections={collections} value="burn" onChange={onChange} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "binder" } });
    expect(onChange).toHaveBeenCalledWith("binder");
  });

  test("points to creating a collection when there are none", () => {
    render(<CollectionPicker collections={[]} value={null} onChange={jest.fn()} />);

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("link", { name: "Create one" }).getAttribute("href")).toBe(
      "/collection/create",
    );
  });
});

describe("collectionLabel", () => {
  test("uses the name, or a stand-in when it's blank", () => {
    expect(collectionLabel("Burn")).toBe("Burn");
    expect(collectionLabel(null)).toBe("Untitled collection");
    expect(collectionLabel("   ")).toBe("Untitled collection");
  });
});
