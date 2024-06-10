import { type inferProcedureInput } from '@trpc/server';
import { createInnerTRPCContext } from '../trpc';
import { appRouter, type AppRouter } from '../root';

test('add and get post', async () => {
  const ctx = createInnerTRPCContext({ session: { user: { id: 'aFakeId' }, expires: 'never' } });
  const caller = appRouter.createCaller(ctx);

  const input: inferProcedureInput<AppRouter['collection']['create']> = {
    name: 'New Collection'
  };

  const collection = await caller.collection.create(input);
  const byId = await caller.collection.byId({ id: collection.id });

  expect(byId).toMatchObject(input);
});
