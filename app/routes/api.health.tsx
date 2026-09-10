import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { runHealthChecks } from "../../server/lib/healthCheck.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const components = await runHealthChecks();
  const overall = components.some((c) => c.status === "error") ? "error" : components.some((c) => c.status === "warning") ? "warning" : "healthy";
  return Response.json({ overall, components });
};
