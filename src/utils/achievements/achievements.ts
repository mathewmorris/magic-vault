/**
 * Every achievement Magic Vault hands out. The key is what's saved in the
 * database, so don't rename one once it has shipped.
 */
export const ACHIEVEMENTS = [
  {
    key: "untap-step",
    title: "Untap Step",
    body: "Turn card tapping off in Settings, then turn it back on.",
    reward: "Free AI scan credits when AI scanning launches.",
  },
] as const;

export type Achievement = (typeof ACHIEVEMENTS)[number];
export type AchievementKey = Achievement["key"];

export const ACHIEVEMENT_KEYS = ACHIEVEMENTS.map((achievement) => achievement.key) as [
  AchievementKey,
  ...AchievementKey[],
];
