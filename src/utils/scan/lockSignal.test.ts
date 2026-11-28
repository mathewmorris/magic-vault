/**
 * @jest-environment jsdom
 */
import {
  LOCK_TONES_HZ,
  LOCK_VIBRATION_MS,
  createLockSignal,
  readToggle,
  saveToggle,
} from "./lockSignal";

function fakeAudio(state: AudioContextState = "running") {
  const oscillators: { frequency: number; started: boolean }[] = [];
  const param = () => ({ setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn() });
  const ctx = {
    state,
    currentTime: 0,
    destination: {},
    resume: jest.fn(() => {
      ctx.state = "running";
      return Promise.resolve();
    }),
    createOscillator: () => {
      const entry = { frequency: 0, started: false };
      oscillators.push(entry);
      return {
        type: "sine",
        frequency: {
          setValueAtTime: (value: number) => {
            entry.frequency = value;
          },
        },
        connect: jest.fn(),
        start: () => {
          entry.started = true;
        },
        stop: jest.fn(),
      };
    },
    createGain: () => ({ gain: param(), connect: jest.fn() }),
  };
  const Ctor = jest.fn(() => ctx);
  return { ctx, Ctor, oscillators };
}

const win = window as unknown as { AudioContext?: unknown };
const nav = navigator as unknown as { vibrate?: unknown };

afterEach(() => {
  delete win.AudioContext;
  delete nav.vibrate;
});

describe("createLockSignal", () => {
  test("vibrates and plays the two-note chime once unlocked", () => {
    const audio = fakeAudio();
    win.AudioContext = audio.Ctor;
    const vibrate = jest.fn(() => true);
    nav.vibrate = vibrate;

    const signal = createLockSignal();
    signal.unlock();
    signal.play({ sound: true });

    expect(vibrate).toHaveBeenCalledWith(LOCK_VIBRATION_MS);
    expect(audio.oscillators.map((o) => o.frequency)).toEqual([...LOCK_TONES_HZ]);
    expect(audio.oscillators.every((o) => o.started)).toBe(true);
  });

  test("stays quiet with sound off, or before a tap unlocked audio", () => {
    const audio = fakeAudio();
    win.AudioContext = audio.Ctor;
    const signal = createLockSignal();

    signal.play({ sound: true });
    expect(audio.Ctor).not.toHaveBeenCalled();

    signal.unlock();
    signal.play({ sound: false });
    expect(audio.oscillators).toHaveLength(0);
  });

  test("resumes a suspended context on unlock", () => {
    const audio = fakeAudio("suspended");
    win.AudioContext = audio.Ctor;
    const signal = createLockSignal();

    signal.unlock();
    expect(audio.ctx.resume).toHaveBeenCalled();
  });

  test("works without vibration or Web Audio", () => {
    const signal = createLockSignal();
    signal.unlock();
    expect(() => signal.play({ sound: true })).not.toThrow();
  });

  test("a vibrate that throws doesn't stop the chime", () => {
    const audio = fakeAudio();
    win.AudioContext = audio.Ctor;
    nav.vibrate = () => {
      throw new Error("blocked");
    };
    const signal = createLockSignal();
    signal.unlock();
    signal.play({ sound: true });
    expect(audio.oscillators).toHaveLength(2);
  });
});

describe("readToggle / saveToggle", () => {
  test("round-trips through storage", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    expect(readToggle("k", true, storage)).toBe(true);
    saveToggle("k", false, storage);
    expect(readToggle("k", true, storage)).toBe(false);
    saveToggle("k", true, storage);
    expect(readToggle("k", false, storage)).toBe(true);
  });

  test("falls back quietly when storage throws or is missing", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(readToggle("k", true, broken)).toBe(true);
    expect(() => saveToggle("k", false, broken)).not.toThrow();
    expect(readToggle("k", false, null)).toBe(false);
  });
});
