import {
  createToast,
  DEFAULT_DURATIONS,
  MAX_TOASTS,
  toastReducer,
  type Toast,
} from "./toastState";

const make = (id: string, message = `message ${id}`): Toast => ({
  id,
  type: "info",
  message,
  duration: 1000,
});

describe("toastReducer", () => {
  test("add puts the new toast at the end", () => {
    const state = toastReducer([make("a")], { type: "add", toast: make("b") });

    expect(state.map((t) => t.id)).toEqual(["a", "b"]);
  });

  test("add drops the oldest once the stack is full", () => {
    let state: Toast[] = [];
    for (let i = 0; i < MAX_TOASTS + 2; i++) {
      state = toastReducer(state, { type: "add", toast: make(`t${i}`) });
    }

    expect(state).toHaveLength(MAX_TOASTS);
    expect(state[0]?.id).toBe("t2");
    expect(state[state.length - 1]?.id).toBe(`t${MAX_TOASTS + 1}`);
  });

  test("add swaps out a toast with the same type and message", () => {
    const state = toastReducer([make("a", "Saved"), make("b", "Other")], {
      type: "add",
      toast: make("c", "Saved"),
    });

    expect(state.map((t) => t.id)).toEqual(["b", "c"]);
  });

  test("add keeps a same-message toast of another type", () => {
    const error: Toast = { ...make("c", "Saved"), type: "error" };
    const state = toastReducer([make("a", "Saved")], {
      type: "add",
      toast: error,
    });

    expect(state.map((t) => t.id)).toEqual(["a", "c"]);
  });

  test("dismiss removes only the matching toast", () => {
    const state = toastReducer([make("a"), make("b")], {
      type: "dismiss",
      id: "a",
    });

    expect(state.map((t) => t.id)).toEqual(["b"]);
  });

  test("dismiss of an unknown id leaves the stack alone", () => {
    const state = toastReducer([make("a")], { type: "dismiss", id: "nope" });

    expect(state.map((t) => t.id)).toEqual(["a"]);
  });

  test("clear empties the stack", () => {
    expect(toastReducer([make("a"), make("b")], { type: "clear" })).toEqual([]);
  });
});

describe("createToast", () => {
  test("gives each toast a unique id", () => {
    const a = createToast("info", "one");
    const b = createToast("info", "one");

    expect(a.id).not.toBe(b.id);
  });

  test("uses the default duration for the type", () => {
    expect(createToast("success", "ok").duration).toBe(
      DEFAULT_DURATIONS.success,
    );
    expect(createToast("error", "bad").duration).toBe(DEFAULT_DURATIONS.error);
  });

  test("errors stay up longer than successes", () => {
    expect(DEFAULT_DURATIONS.error).toBeGreaterThan(DEFAULT_DURATIONS.success);
  });

  test("takes a custom duration", () => {
    expect(createToast("info", "hi", 250).duration).toBe(250);
  });
});
