import type { NextApiRequest, NextApiResponse } from 'next'
import { appRouter } from '~/server/api/root';
import { prisma } from '~/server/db';

type ResponseData = {
	message: string
}

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse<ResponseData>
) {
	if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
		res.status(401).end('Unauthorized');
	} else {
		const session = { user: { id: 'CRON_JOB' }, expires: '' };
		const caller = appRouter.createCaller({ session, prisma: prisma });

		try {
			const numberOfDeletedCollections = await caller.collection.destroy30DaysOld();

			res.status(200).json({ message: `Deleted ${numberOfDeletedCollections.count} collections!` });
		} catch (error) {
			res.status(500).json({ message: "Something went wrong when trying to cleanup." });
		}
	}

	res.end();
}

