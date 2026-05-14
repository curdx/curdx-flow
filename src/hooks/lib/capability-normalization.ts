// Known companion capability names are routing inputs, not product stack facts.
// Strip them before running goal regexes that infer frontend/browser/runtime
// intent, otherwise names such as "ui-ux-pro-max" or "uiuxmax" look like UI work.

import { knownCapabilityTokenRegex } from "../../registry/capability-tokens.ts";

export function stripKnownCapabilityTokens(input: string | undefined): string {
  return (input ?? "").replace(knownCapabilityTokenRegex(), " ");
}
