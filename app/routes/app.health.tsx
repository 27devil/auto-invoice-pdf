import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { runHealthChecks } from "../../server/lib/healthCheck.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const components = await runHealthChecks();
  return { components };
};

const TONE: Record<string, string> = { healthy: "success", warning: "warning", error: "critical" };
const LABEL: Record<string, string> = { healthy: "Healthy", warning: "Warning", error: "Error" };

export default function HealthPage() {
  const { components } = useLoaderData<typeof loader>();

  return (
    <s-page heading="System health">
      <s-section>
        <s-stack direction="block" gap="base">
          {components.map((c) => (
            <s-box key={c.name} padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="inline" gap="base" justifyContent="space-between">
                <s-text type="strong">{c.name}</s-text>
                <s-badge tone={TONE[c.status] as never}>{LABEL[c.status]}</s-badge>
              </s-stack>
              <s-paragraph>{c.detail}</s-paragraph>
            </s-box>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
