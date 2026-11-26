/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";

import SessionTally from "./SessionTally";

const burn = { collectionId: "burn", collectionName: "Burn" };

describe("SessionTally", () => {
  test("renders nothing before anything is added", () => {
    const { container } = render(<SessionTally added={[]} onUndo={jest.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  test("shows the running count and each card", () => {
    render(
      <SessionTally
        added={[
          { cardId: "bolt", name: "Lightning Bolt", ...burn },
          { cardId: "goyf", name: "Tarmogoyf", ...burn },
          { cardId: "bolt", name: "Lightning Bolt", ...burn },
        ]}
        onUndo={jest.fn()}
      />,
    );

    expect(screen.getByRole("heading").textContent).toBe("Added this session: 3 cards");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "2x Lightning Bolt in Burn",
      "1x Tarmogoyf in Burn",
    ]);
  });

  test("undoes the last card added", () => {
    const onUndo = jest.fn();
    render(
      <SessionTally added={[{ cardId: "goyf", name: "Tarmogoyf", ...burn }]} onUndo={onUndo} />,
    );

    expect(screen.getByRole("heading").textContent).toBe("Added this session: 1 card");
    fireEvent.click(screen.getByRole("button", { name: "Undo Tarmogoyf" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
