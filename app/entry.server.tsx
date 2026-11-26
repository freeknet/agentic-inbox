// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import createEmotionServer from "@emotion/server/create-instance";
import type { EntryContext, RouterContextProvider } from "react-router";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: RouterContextProvider
) {
  let shellRendered = false;
  const userAgent = request.headers.get("user-agent");

  // One emotion cache per request, so its collected styles belong to this
  // render only. The key matches the browser's default ("css"), which keeps
  // the generated class names identical on both sides of hydration.
  const cache = createCache({ key: "css" });
  cache.compat = true;
  const { extractCritical } = createEmotionServer(cache);

  const body = await renderToReadableStream(
    <CacheProvider value={cache}>
      <ServerRouter context={routerContext} url={request.url} />
    </CacheProvider>,
    {
      onError(error: unknown) {
        responseStatusCode = 500;
        // Log streaming rendering errors from inside the shell.  Don't log
        // errors encountered during initial shell rendering since they'll
        // reject and get logged in handleDocumentRequest.
        if (shellRendered) {
          console.error(error);
        }
      },
    }
  );
  shellRendered = true;

  // Bots and SPA-mode renders need the whole document; the styles do too,
  // because they can only be extracted once every component has rendered.
  if ((userAgent && isbot(userAgent)) || routerContext.isSpaMode) {
    await body.allReady;
  }

  const html = await new Response(body).text();
  // Pull the emotion <style> tags out of the body and hand them back as one
  // block for <head>, so the first paint is already styled.
  const { html: withoutStyles, css } = extractCritical(html);
  const withStyles = css
    ? withoutStyles.replace("</head>", `<style data-emotion="css">${css}</style></head>`)
    : withoutStyles;

  responseHeaders.set("Content-Type", "text/html");
  return new Response(withStyles, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
