import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRssFeed } from "../rss.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimeOriginToken = "https://monitor-fiscal-brasil.local";
const outputRoot = resolve(
  process.env.SITES_DIST_DIR ?? join(tmpdir(), "monitor-fiscal-brasil-build"),
);
const dist = join(outputRoot, "dist");
const client = join(dist, "client");
const server = join(dist, "server");
const openai = join(dist, ".openai");

const assetFiles = [
  "index.html",
  "styles.css",
  "data.js",
  "app.js",
];

const generatedAssets = [
  {
    path: "feed.xml",
    body: createRssFeed({ siteUrl: runtimeOriginToken, selfPath: "/feed.xml" }),
  },
  {
    path: "rss.xml",
    body: createRssFeed({ siteUrl: runtimeOriginToken, selfPath: "/rss.xml" }),
  },
];

async function readSource(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

async function copyToClient(relativePath) {
  const target = join(client, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, await readSource(relativePath));
}

function workerSource(assetMap) {
  return `
const assets = new Map(${JSON.stringify(assetMap)});
const runtimeOriginToken = ${JSON.stringify(runtimeOriginToken)};

function responseFor(pathname) {
  const key = pathname === "/" ? "/index.html" : pathname;
  return assets.get(key) ?? assets.get("/index.html");
}

function assetForRequest(url) {
  const asset = responseFor(url.pathname);
  if (asset.contentType.includes("application/rss+xml")) {
    return { ...asset, body: asset.body.replaceAll(runtimeOriginToken, url.origin) };
  }
  return asset;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const asset = assetForRequest(url);
    return new Response(asset.body, {
      headers: {
        "content-type": asset.contentType,
        "cache-control": asset.contentType.includes("text/html") ||
          asset.contentType.includes("application/rss+xml")
          ? "no-store"
          : "public, max-age=31536000, immutable",
      },
    });
  },
};
`;
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(server, { recursive: true });
await mkdir(openai, { recursive: true });

for (const file of assetFiles) {
  await copyToClient(file);
}

for (const asset of generatedAssets) {
  const target = join(client, asset.path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, asset.body);
}

let hostingJson = "{}";
try {
  hostingJson = await readSource(".openai/hosting.json");
} catch {
  try {
    hostingJson = await readSource(".openai-hosting.json");
  } catch {
    hostingJson = "{}";
  }
}
await writeFile(join(openai, "hosting.json"), hostingJson);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".xml": "application/rss+xml; charset=utf-8",
};

const assetMap = [];
for (const file of assetFiles) {
  const body = await readSource(file);
  const route = file === "index.html" ? "/index.html" : `/${file}`;
  const extension = `.${basename(file).split(".").pop()}`;
  assetMap.push([
    route,
    {
      body,
      contentType: contentTypes[extension] ?? "text/plain; charset=utf-8",
    },
  ]);
}
for (const asset of generatedAssets) {
  const extension = `.${basename(asset.path).split(".").pop()}`;
  assetMap.push([
    `/${asset.path}`,
    {
      body: asset.body,
      contentType: contentTypes[extension] ?? "text/plain; charset=utf-8",
    },
  ]);
}

await writeFile(join(server, "index.js"), workerSource(assetMap));

console.log(`Built Sites artifact source at ${outputRoot}`);
