import { renderTrpcPanel } from "trpc-panel";

import { appRouter } from "~/server/api/root";

export function GET() {
  const html = renderTrpcPanel(appRouter, {
    url: "http://localhost:3000/api/trpc",
    transformer: "superjson",
  });

  return new Response(html, {
    headers: { "content-type": "text/html" },
  });
}
