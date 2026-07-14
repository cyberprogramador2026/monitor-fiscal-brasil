import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRssFeed } from "../rss.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const siteUrl =
  process.env.RSS_SITE_URL ?? "https://cyberprogramador2026.github.io/monitor-fiscal-brasil/";

await writeFile(join(root, "feed.xml"), createRssFeed({ siteUrl, selfPath: "/feed.xml" }));
await writeFile(join(root, "rss.xml"), createRssFeed({ siteUrl, selfPath: "/rss.xml" }));

console.log(`Feeds RSS gerados para ${siteUrl}`);
