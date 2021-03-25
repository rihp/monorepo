import { Tracer } from "@web3api/tracing";

import { Uri, UriRedirect } from "../types";

export function getImplementations(
  abstractApi: Uri,
  redirects: readonly UriRedirect<Uri>[]
): Uri[] {
  const result: Uri[] = [];

  Tracer.startSpan("core: getImplementations");
  Tracer.setAttribute("abstractApi", abstractApi);
  Tracer.setAttribute("redirects", redirects);

  for (const redirect of redirects) {
    // Plugin implemented check
    if (!Uri.isUri(redirect.to)) {
      const { implemented } = redirect.to.manifest;
      const implementedApi =
        implemented.findIndex((uri) => Uri.equals(uri, abstractApi)) > -1;

      if (implementedApi) {
        result.push(redirect.from);
      }
    }
    // Explicit check
    else if (Uri.isUri(redirect.from)) {
      if (Uri.equals(redirect.from, abstractApi)) {
        result.push(redirect.to);
      }
    }
  }

  Tracer.addEvent("get implementations finished", result);
  Tracer.endSpan();

  return result;
}
