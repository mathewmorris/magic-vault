import { NextResponse } from "next/server";

import { appRouter } from "~/server/api/root";
import { prisma } from "~/server/db";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const session = { user: { id: "CRON_JOB" }, expires: "" };
  const caller = appRouter.createCaller({ session, prisma });

  try {
    const result = await caller.collection.destroy30DaysOld();
    return NextResponse.json({
      message: `Deleted ${result.count} collections!`,
    });
  } catch (error) {
    return NextResponse.json(
      { message: "Something went wrong when trying to cleanup." },
      { status: 500 }
    );
  }
}
