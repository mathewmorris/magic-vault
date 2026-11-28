"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";

import { mutedText, panel } from "~/components/home/styles";
import { useToast } from "~/components/toast";
import { ACHIEVEMENTS, ACHIEVEMENT_KEYS, type AchievementKey } from "~/utils/achievements/achievements";
import { api } from "~/utils/api";
import {
  addPendingAchievement,
  clearPendingAchievements,
  pendingAchievements,
  useCardTap,
} from "~/utils/cardTap";
import { signInHref } from "~/utils/signInHref";

function isAchievementKey(key: string): key is AchievementKey {
  return (ACHIEVEMENT_KEYS as readonly string[]).includes(key);
}

/** The Settings page: the card tap switch and the achievements list. */
export default function SettingsPanel() {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const toast = useToast();
  const utils = api.useUtils();
  const [tapOn, setTapOn] = useCardTap();

  const earned = api.achievement.list.useQuery(undefined, { enabled: signedIn });
  const unlock = api.achievement.unlock.useMutation({
    onSuccess: async (result) => {
      await utils.achievement.list.invalidate();
      const achievement = ACHIEVEMENTS.find((item) => item.key === result.key);
      if (result.isNew && achievement) toast.success(`Achievement unlocked: ${achievement.title}`);
    },
  });

  // Claim anything earned while signed out, once, when Settings loads signed in.
  const claimed = useRef(false);
  const { mutate } = unlock;
  useEffect(() => {
    if (!signedIn || claimed.current) return;
    claimed.current = true;
    const pending = pendingAchievements().filter(isAchievementKey);
    clearPendingAchievements();
    pending.forEach((key) => mutate({ key }));
  }, [signedIn, mutate]);

  const earnedAt = new Map((earned.data ?? []).map((item) => [item.key, item.earnedAt]));

  const toggle = () => {
    const next = !tapOn;
    const earnedUntap = setTapOn(next);
    if (!earnedUntap) return;
    if (signedIn) {
      unlock.mutate({ key: "untap-step" });
    } else {
      addPendingAchievement("untap-step");
      toast.success("Achievement unlocked: Untap Step. Sign in to keep it.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <header className="space-y-2">
        <h1 className="text-4xl font-bold">Settings</h1>
        <p className={mutedText}>These are saved in this browser.</p>
      </header>

      <section aria-labelledby="tap-heading" className={`flex items-start justify-between gap-6 ${panel}`}>
        <div className="space-y-1">
          <h2 id="tap-heading" className="text-lg font-semibold">
            Card tap
          </h2>
          <p id="tap-description" className={`text-sm ${mutedText}`}>
            Cards on the home page turn sideways, like a tapped permanent, before they open.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={tapOn}
          aria-labelledby="tap-heading"
          aria-describedby="tap-description"
          onClick={toggle}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 ${
            tapOn ? "bg-pink-600" : "bg-gray-300 dark:bg-gray-700"
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
              tapOn ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </section>

      <section aria-labelledby="achievements-heading" className="space-y-4">
        <h2 id="achievements-heading" className="text-2xl font-bold">
          Achievements
        </h2>
        {!signedIn && status !== "loading" ? (
          <p className={`text-sm ${mutedText}`}>
            <Link href={signInHref("/settings")} className="font-semibold text-pink-600 underline dark:text-pink-400">
              Sign in
            </Link>{" "}
            to keep the achievements you earn.
          </p>
        ) : null}
        <ul className="space-y-3">
          {ACHIEVEMENTS.map((achievement) => {
            const date = earnedAt.get(achievement.key);
            return (
              <li key={achievement.key} className={`space-y-1 ${panel}`} data-earned={date ? "true" : undefined}>
                <div className="flex items-center justify-between gap-4">
                  <span className="font-semibold">{achievement.title}</span>
                  <span
                    className={`text-xs font-semibold uppercase tracking-wide ${
                      date ? "text-pink-600 dark:text-pink-400" : "text-gray-500"
                    }`}
                  >
                    {date ? `Earned ${date.toLocaleDateString("en-US")}` : "Locked"}
                  </span>
                </div>
                <p className={`text-sm ${mutedText}`}>{achievement.body}</p>
                <p className="text-sm text-purple-600 dark:text-purple-300">Reward: {achievement.reward}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
