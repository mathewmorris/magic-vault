import prismaMock from "singleton";
import { TRPCError } from "@trpc/server";

import { createInnerTRPCContext } from "../trpc";
import { appRouter } from "../root";

describe("achievement procedures", () => {
  const userId = "user123";
  const earnedAt = new Date("2026-11-28T00:00:00Z");

  const authedCaller = () => {
    const ctx = createInnerTRPCContext({ session: { user: { id: userId, name: "John Doe" }, expires: "1" } });
    return appRouter.createCaller({ ...ctx, prisma: prismaMock });
  };
  const unauthedCaller = () => {
    const ctx = createInnerTRPCContext({ session: null });
    return appRouter.createCaller({ ...ctx, prisma: prismaMock });
  };

  test("list returns only the signed-in user's achievements", async () => {
    prismaMock.userAchievement.findMany.mockResolvedValue([
      { userId, key: "untap-step", earnedAt },
    ]);

    const result = await authedCaller().achievement.list();

    expect(result).toEqual([{ userId, key: "untap-step", earnedAt }]);
    expect(prismaMock.userAchievement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId } }),
    );
  });

  test("unlock saves a new achievement", async () => {
    prismaMock.userAchievement.findUnique.mockResolvedValue(null);
    prismaMock.userAchievement.upsert.mockResolvedValue({ userId, key: "untap-step", earnedAt });

    const result = await authedCaller().achievement.unlock({ key: "untap-step" });

    expect(result).toEqual(expect.objectContaining({ key: "untap-step", isNew: true }));
    expect(prismaMock.userAchievement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { userId, key: "untap-step" } }),
    );
  });

  test("unlocking twice keeps the first one", async () => {
    prismaMock.userAchievement.findUnique.mockResolvedValue({ userId, key: "untap-step", earnedAt });

    const result = await authedCaller().achievement.unlock({ key: "untap-step" });

    expect(result).toEqual(expect.objectContaining({ isNew: false, earnedAt }));
    expect(prismaMock.userAchievement.upsert).not.toHaveBeenCalled();
  });

  test("unlock rejects keys that aren't achievements", async () => {
    await expect(
      // @ts-expect-error not a real achievement key
      authedCaller().achievement.unlock({ key: "free-money" }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  test("signed-out callers can't list or unlock", async () => {
    await expect(unauthedCaller().achievement.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(unauthedCaller().achievement.unlock({ key: "untap-step" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
