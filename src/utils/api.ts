/**
 * This is the client-side entrypoint for your tRPC API. It is used to create the `api` object which
 * contains the type-safe React Query hooks.
 *
 * We also create a few inference helpers for input and output types.
 */
import { createTRPCReact } from "@trpc/react-query";
import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";

import { type AppRouter } from "~/server/api/root";

/** A set of type-safe react-query hooks for your tRPC API. */
export const api = createTRPCReact<AppRouter>();

/**
 * Inference helper for inputs.
 *
 * @collection type HelloInput = RouterInputs['collection']['hello']
 */
export type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Inference helper for outputs.
 *
 * @collection type HelloOutput = RouterOutputs['collection']['hello']
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
