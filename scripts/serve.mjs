import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRssFeed } from "../rss.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT ?? 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/rss+xml; charset=utf-8",
  ".svg": "image/svg+xml",
};

const rssPaths = new Set(["/feed.xml", "/rss.xml"]);

function safePath(urlPath) {
  const cleanPath = urlPath === "/" ? "/index.html" : decodeURIComponent(urlPath);
  const target = normalize(join(root, cleanPath));
  return target.startsWith(root) ? target : join(root, "index.html");
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  if (rssPaths.has(url.pathname)) {
    response.writeHead(200, {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(createRssFeed({ siteUrl: url.origin, selfPath: url.pathname }));
    return;
  }

  let filePath = safePath(url.pathname);
  if (!existsSync(filePath)) {
    filePath = join(root, "index.html");
  }

  response.writeHead(200, {
    "content-type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Monitor Fiscal Brasil: http://127.0.0.1:${port}`);
});
