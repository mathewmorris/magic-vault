/**
 * The "got it" signal when the AI scanner locks onto a card: a short buzz
 * where the phone can vibrate, and a short two-note chime made with Web
 * Audio (no sound files). The green flash on the video is CSS in the
 * scanner.
 *
 * Browsers only let a page make sound after the user has touched it, so
 * call `unlock()` from a tap (the scanner does on any pointer down); until
 * then `play()` only vibrates. iPhones don't vibrate from the web at all.
 *
 * Also the scanner's two remembered settings, "Sound" and "Auto add when
 * sure", kept in localStorage. Storage can be missing or throw (private
 * windows, blocked site data), so every read and write is wrapped.
 */

export const SOUND_KEY = "magic-vault:scan:sound";
export const AUTO_ADD_KEY = "magic-vault:scan:auto-add";

/** Vibration pattern on lock, in ms. */
export const LOCK_VIBRATION_MS = 60;
/** The chime: two short notes, a fifth apart. */
export const LOCK_TONES_HZ = [880, 1320] as const;
export const LOCK_TONE_MS = 90;
const LOCK_VOLUME = 0.15;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** A remembered on/off setting, `fallback` when unset or unreadable. */
export function readToggle(key: string, fallback: boolean, storage = defaultStorage()): boolean {
  try {
    const value = storage?.getItem(key);
    return value === "on" ? true : value === "off" ? false : fallback;
  } catch {
    return fallback;
  }
}

export function saveToggle(key: string, value: boolean, storage = defaultStorage()): void {
  try {
    storage?.setItem(key, value ? "on" : "off");
  } catch {
    // Forgetting the setting only costs a tap next time.
  }
}

type AudioContextLike = Pick<AudioContext, "currentTime" | "destination" | "state" | "resume"> & {
  createOscillator: () => OscillatorNode;
  createGain: () => GainNode;
};

type AudioContextCtor = new () => AudioContextLike;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export type LockSignal = {
  /** Call from a user gesture so later chimes are allowed to play. */
  unlock: () => void;
  /** Buzz, and chime if `sound` and audio has been unlocked. */
  play: (options: { sound: boolean }) => void;
};

export function createLockSignal(): LockSignal {
  let context: AudioContextLike | null = null;

  const unlock = () => {
    try {
      if (!context) {
        const Ctor = audioContextCtor();
        if (!Ctor) return;
        context = new Ctor();
      }
      if (context.state === "suspended") void context.resume().catch(() => undefined);
    } catch {
      context = null;
    }
  };

  const chime = (ctx: AudioContextLike) => {
    const start = ctx.currentTime;
    const step = LOCK_TONE_MS / 1000;
    LOCK_TONES_HZ.forEach((frequency, i) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = start + i * step;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, t0);
      // A quick fade in and out, so the notes don't click.
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(LOCK_VOLUME, t0 + 0.01);
      gain.gain.linearRampToValueAtTime(0, t0 + step);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(t0);
      oscillator.stop(t0 + step + 0.02);
    });
  };

  const play = ({ sound }: { sound: boolean }) => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(LOCK_VIBRATION_MS);
      }
    } catch {
      // Some browsers throw when vibration is blocked; the chime and flash still show.
    }
    if (!sound || !context || context.state !== "running") return;
    try {
      chime(context);
    } catch (error) {
      console.warn("Couldn't play the scan sound", error);
    }
  };

  return { unlock, play };
}
