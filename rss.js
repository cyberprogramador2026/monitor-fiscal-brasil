import { changeSeed, severityLabels, sourceSeed, statusLabels } from "./data.js";

const fallbackSiteUrl = "https://monitor-fiscal-brasil.local";
const feedTitle = "Monitor Fiscal Brasil - Avisos fiscais";
const feedDescription =
  "Mudancas fiscais detectadas pelo Monitor Fiscal Brasil, com resumo, impacto e acao sugerida.";
const maxItems = 50;

const sourceById = new Map(sourceSeed.map((source) => [source.id, source]));

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeBaseUrl(value) {
  try {
    const url = new URL(value);
    const pathname = url.pathname.replace(/\/$/, "");
    return `${url.origin}${pathname === "/" ? "" : pathname}`;
  } catch {
    return fallbackSiteUrl;
  }
}

function parseFiscalDate(value) {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00-03:00` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateForChange(change) {
  return (
    parseFiscalDate(change.detectedAt) ??
    parseFiscalDate(change.publicationDate) ??
    parseFiscalDate(change.effectiveDate) ??
    new Date(0)
  );
}

function officialLink(change, source, siteUrl) {
  return change.evidenceUrl || source?.url || `${siteUrl}/`;
}

function appLink(change, siteUrl) {
  return `${siteUrl}/#avisos/${encodeURIComponent(change.id)}`;
}

function itemDescription(change, source, siteUrl) {
  const official = officialLink(change, source, siteUrl);
  const sourceName = source?.name ?? "Fonte oficial";
  const details = [
    `<p>${escapeXml(change.summary)}</p>`,
    `<p><strong>Impacto:</strong> ${escapeXml(change.impact)}</p>`,
    `<p><strong>Acao sugerida:</strong> ${escapeXml(change.action)}</p>`,
    `<p><strong>Status:</strong> ${escapeXml(statusLabels[change.status] ?? change.status)}</p>`,
    `<p><strong>Fonte:</strong> <a href="${escapeXml(official)}">${escapeXml(sourceName)}</a></p>`,
  ];

  if (change.effectiveDate) {
    details.splice(
      3,
      0,
      `<p><strong>Vigencia:</strong> ${escapeXml(change.effectiveDate)}</p>`,
    );
  }

  return details.join("");
}

function itemCategories(change) {
  return [
    severityLabels[change.severity] ?? change.severity,
    statusLabels[change.status] ?? change.status,
    change.uf ? `UF ${change.uf}` : "Nacional",
    change.area,
    change.theme,
    ...change.documents,
  ].filter(Boolean);
}

export function getRssItems() {
  return changeSeed
    .filter((change) => change.status !== "IGNORED")
    .map((change) => ({
      change,
      source: sourceById.get(change.sourceId),
      date: dateForChange(change),
    }))
    .sort((a, b) => b.date - a.date)
    .slice(0, maxItems);
}

export function createRssFeed({ siteUrl = fallbackSiteUrl, selfPath = "/feed.xml" } = {}) {
  const baseUrl = normalizeBaseUrl(siteUrl);
  const selfUrl = `${baseUrl}${selfPath}`;
  const items = getRssItems();
  const lastBuildDate = items[0]?.date ?? new Date();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(feedTitle)}</title>
    <link>${escapeXml(baseUrl)}</link>
    <atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(feedDescription)}</description>
    <language>pt-BR</language>
    <lastBuildDate>${lastBuildDate.toUTCString()}</lastBuildDate>
    <ttl>30</ttl>
${items
  .map(({ change, source, date }) => {
    const title = `[${severityLabels[change.severity] ?? change.severity}] ${change.title}`;
    const link = appLink(change, baseUrl);
    const description = itemDescription(change, source, baseUrl);
    const categories = itemCategories(change)
      .map((category) => `      <category>${escapeXml(category)}</category>`)
      .join("\n");

    return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">monitor-fiscal-brasil:${escapeXml(change.id)}</guid>
      <pubDate>${date.toUTCString()}</pubDate>
      <description>${escapeXml(description)}</description>
${categories}
    </item>`;
  })
  .join("\n")}
  </channel>
</rss>
`;
}
