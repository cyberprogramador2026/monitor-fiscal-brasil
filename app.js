import {
  calendarSeed,
  changeSeed,
  frequencyLabels,
  severityLabels,
  sourceSeed,
  statusLabels,
} from "./data.js";

const storageKeys = {
  changes: "monitor-fiscal:changes",
  sources: "monitor-fiscal:sources",
  calendar: "monitor-fiscal:calendar",
};

const severityOrder = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const today = new Date("2026-07-07T12:00:00-03:00");

const state = {
  view: "dashboard",
  query: "",
  uf: "ALL",
  document: "ALL",
  severity: "ALL",
  status: "ALL",
  selectedChangeId: "chg-nfe-nt-2026",
  calendarMonth: new Date("2026-07-01T00:00:00-03:00"),
};

const store = {
  changes: loadCollection(storageKeys.changes, changeSeed),
  sources: loadCollection(storageKeys.sources, sourceSeed),
  calendar: loadCollection(storageKeys.calendar, calendarSeed),
};

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

function loadCollection(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function saveCollection(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function byId(collection, id) {
  return collection.find((item) => item.id === id);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value) {
  if (!value) return "A definir";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00-03:00`));
}

function addDays(value, amount) {
  const date = new Date(`${value}T12:00:00-03:00`);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

function dayDistance(value) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00-03:00`);
  return Math.round((date - today) / 86400000);
}

function hashNumber(value) {
  return Array.from(String(value)).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function enrichedChange(change) {
  const baseDate = change.publicationDate ?? change.detectedAt.slice(0, 10);
  const derivedProtocol = `2026/${String(70 + (hashNumber(change.id) % 120)).padStart(4, "0")}`;

  return {
    ...change,
    protocol: change.protocol ?? derivedProtocol,
    publicationDate: baseDate,
    homologationDate: change.homologationDate ?? addDays(baseDate, 20),
    productionDate: change.productionDate ?? addDays(baseDate, 42),
    effectiveDate:
      change.effectiveDate ??
      (change.severity === "LOW" ? addDays(baseDate, 90) : addDays(baseDate, 60)),
    area:
      change.area ??
      (change.documents.some((doc) => ["NF-e", "NFC-e", "MDF-e", "CT-e"].includes(doc))
        ? "Desenvolvimento"
        : "Fiscal"),
    evidence: change.evidence ?? "",
    changedExcerpt: change.changedExcerpt ?? change.diffAfter ?? change.summary,
  };
}

function deadlineLabel(change) {
  const days = dayDistance(enrichedChange(change).effectiveDate);
  if (days === null) return "Sem obrigatoriedade";
  if (days < 0) return `${Math.abs(days)}d vencido`;
  if (days === 0) return "vence hoje";
  return `vence em ${days}d`;
}

function nextJobLabel() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(now.getHours() + 1, 0, 0, 0);
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(next);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function severityClass(severity) {
  return `severity severity-${severity.toLowerCase()}`;
}

function statusClass(status) {
  return `status status-${status.toLowerCase().replace("_", "-")}`;
}

function sourceFor(change) {
  return byId(store.sources, change.sourceId) ?? {
    name: "Fonte nao encontrada",
    agency: "-",
    url: "#",
    uf: null,
  };
}

function filteredChanges() {
  const query = state.query.trim().toLowerCase();
  return store.changes
    .filter((change) => {
      const source = sourceFor(change);
      const haystack = [
        change.title,
        change.summary,
        change.theme,
        source.name,
        source.agency,
        change.documents.join(" "),
        change.uf ?? "NACIONAL",
      ]
        .join(" ")
        .toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      const matchesUf =
        state.uf === "ALL" ||
        (state.uf === "NACIONAL" ? !change.uf : change.uf === state.uf);
      const matchesDocument =
        state.document === "ALL" || change.documents.includes(state.document);
      const matchesSeverity = state.severity === "ALL" || change.severity === state.severity;
      const matchesStatus = state.status === "ALL" || change.status === state.status;
      return (
        matchesQuery &&
        matchesUf &&
        matchesDocument &&
        matchesSeverity &&
        matchesStatus
      );
    })
    .sort((a, b) => {
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.detectedAt) - new Date(a.detectedAt);
    });
}

function refreshMetrics() {
  const active = store.sources.filter((source) => source.active).length;
  const open = store.changes.filter((change) =>
    ["DRAFT", "IN_REVIEW"].includes(change.status),
  ).length;
  const critical = store.changes.filter(
    (change) =>
      ["DRAFT", "IN_REVIEW"].includes(change.status) &&
      ["HIGH", "CRITICAL"].includes(change.severity),
  ).length;

  document.querySelector("#metric-active").textContent = active;
  document.querySelector("#metric-open").textContent = open;
  document.querySelector("#metric-critical").textContent = critical;
  document.querySelector("#metric-next-job").textContent = nextJobLabel();
}

function bindShell() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      setActiveTab();
      render();
      app.focus();
    });
  });
}

function render() {
  refreshMetrics();
  const views = {
    dashboard: renderDashboard,
    avisos: renderAvisos,
    calendario: renderCalendario,
    fontes: renderFontes,
    revisao: renderRevisao,
  };
  app.innerHTML = views[state.view]();
  bindDynamicActions();
}

function renderDashboard() {
  const enriched = store.changes.map(enrichedChange);
  const openCritical = enriched.filter((change) => ["CRITICAL", "HIGH"].includes(change.severity));
  const analysisList = enriched
    .slice()
    .sort((a, b) => {
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.detectedAt) - new Date(a.detectedAt);
    })
    .slice(0, 6);
  const bySeverity = Object.keys(severityLabels).map((severity) => ({
    severity,
    total: enriched.filter((change) => change.severity === severity).length,
  }));
  const maxSeverity = Math.max(...bySeverity.map((item) => item.total), 1);
  const urgent = enriched
    .filter((change) => dayDistance(change.effectiveDate) !== null)
    .sort((a, b) => dayDistance(a.effectiveDate) - dayDistance(b.effectiveDate))
    .slice(0, 5);

  return `
    <section class="view-grid">
      <div class="panel panel-wide ruler-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Timeline fiscal</p>
            <h2>Regua de vigencia</h2>
          </div>
          <button class="button button-primary" type="button" data-action="simulate-check">
            Executar verificacao
          </button>
        </div>
        ${renderVigenciaRuler(urgent)}
      </div>

      <div class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Fontes oficiais</p>
            <h2>URLs analisadas</h2>
          </div>
        </div>
        ${renderSourceCoverage()}
      </div>

      <div class="panel panel-wide">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Sintese por URL</p>
            <h2>Mudancas fiscais detectadas</h2>
          </div>
        </div>
        <div class="analysis-list">
          ${analysisList.map(renderAnalysisRow).join("")}
        </div>
      </div>

      <div class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Criticidade</p>
            <h2>Impacto fiscal</h2>
          </div>
        </div>
        <div class="bar-chart" aria-label="Mudancas por criticidade">
          ${bySeverity
            .map(
              (item) => `
                <div class="bar-row">
                  <span>${severityLabels[item.severity]}</span>
                  <div class="bar-track">
                    <span class="bar-fill ${item.severity.toLowerCase()}" style="width: ${
                      (item.total / maxSeverity) * 100
                    }%"></span>
                  </div>
                  <strong>${item.total}</strong>
                </div>
              `,
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function renderVigenciaRuler(changes) {
  const rangeStart = -15;
  const rangeEnd = 90;
  const rangeSpan = rangeEnd - rangeStart;
  const ticks = [-10, 0, 15, 30, 60, 90];
  const positioned = changes
    .map((change) => ({ ...change, distance: dayDistance(change.effectiveDate) }))
    .filter((change) => change.distance !== null && change.distance >= rangeStart && change.distance <= rangeEnd);

  return `
    <div class="vigencia-ruler" aria-label="Regua de vigencia fiscal">
      <div class="ruler-track">
        <span class="ruler-axis"></span>
        <span class="ruler-today" style="left: ${((0 - rangeStart) / rangeSpan) * 100}%">
          <span>HOJE</span>
        </span>
        ${ticks
          .map(
            (tick) => `
              <span class="ruler-tick" style="left: ${((tick - rangeStart) / rangeSpan) * 100}%">
                ${tick === 0 ? "" : tick > 0 ? `+${tick}d` : `${tick}d`}
              </span>
            `,
          )
          .join("")}
        ${positioned
          .map(
            (change) => `
              <button
                class="ruler-marker marker-${change.severity.toLowerCase()}"
                type="button"
                data-action="select-change"
                data-id="${change.id}"
                style="left: ${((change.distance - rangeStart) / rangeSpan) * 100}%"
                title="${escapeHtml(change.title)} - ${formatDate(change.effectiveDate)}"
              >
                <span>${escapeHtml(change.protocol)}</span>
              </button>
            `,
          )
          .join("")}
      </div>
      <div class="ruler-legend">
        <span>Publicacoes oficiais e obrigatoriedades perto de hoje</span>
        <strong>07/07/2026</strong>
      </div>
    </div>
  `;
}

function renderAnalysisRow(change) {
  const source = sourceFor(change);
  return `
    <button class="analysis-row" type="button" data-action="select-change" data-id="${change.id}">
      <span class="analysis-source">
        <span>${escapeHtml(source.agency)}</span>
        <small>${escapeHtml(source.url)}</small>
      </span>
      <span class="analysis-copy">
        <strong>${escapeHtml(change.title)}</strong>
        <small>Trecho: ${escapeHtml(change.changedExcerpt)}</small>
      </span>
      <span class="${severityClass(change.severity)}">${severityLabels[change.severity]}</span>
      <em>${deadlineLabel(change)}</em>
    </button>
  `;
}

function renderSourceCoverage() {
  const activeSources = store.sources.filter((source) => source.active);
  const national = activeSources.filter((source) => !source.uf).length;
  const states = new Set(activeSources.map((source) => source.uf).filter(Boolean)).size;
  return `
    <div class="source-coverage">
      <div><strong>${activeSources.length}</strong><span>fontes ativas</span></div>
      <div><strong>${national}</strong><span>nacionais</span></div>
      <div><strong>${states}</strong><span>UFs cobertas</span></div>
    </div>
    <div class="source-samples">
      ${activeSources
        .slice(0, 6)
        .map(
          (source) => `
            <a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">
              <strong>${escapeHtml(source.name)}</strong>
              <span>${escapeHtml(source.url)}</span>
            </a>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderAvisos() {
  const changes = filteredChanges();
  const selected = byId(store.changes, state.selectedChangeId) ?? changes[0];
  if (selected) state.selectedChangeId = selected.id;

  return `
    ${renderFilters()}
    <section class="split-layout">
      <div class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">${changes.length} registros</p>
            <h2>Avisos fiscais</h2>
          </div>
          <button class="button" type="button" data-action="export-csv">Exportar CSV</button>
        </div>
        <div class="alert-list">
          ${changes.length ? changes.map(renderChangeCard).join("") : renderEmpty("Nenhum aviso encontrado.")}
        </div>
      </div>
      <aside class="panel detail-panel">
        ${selected ? renderChangeDetail(selected) : renderEmpty("Selecione um aviso.")}
      </aside>
    </section>
  `;
}

function renderFilters() {
  const ufs = ["NACIONAL", ...new Set(store.sources.map((source) => source.uf).filter(Boolean))];
  const documents = [...new Set(store.sources.flatMap((source) => source.documents))].sort();
  return `
    <section class="filters" aria-label="Filtros">
      <label>
        <span>Busca</span>
        <input type="search" value="${escapeHtml(state.query)}" data-filter="query" placeholder="NT, cBenef, SPED" />
      </label>
      <label>
        <span>UF</span>
        <select data-filter="uf">
          <option value="ALL">Todas</option>
          ${ufs
            .map(
              (uf) => `<option value="${uf}" ${state.uf === uf ? "selected" : ""}>${uf}</option>`,
            )
            .join("")}
        </select>
      </label>
      <label>
        <span>Documento</span>
        <select data-filter="document">
          <option value="ALL">Todos</option>
          ${documents
            .map(
              (doc) =>
                `<option value="${escapeHtml(doc)}" ${
                  state.document === doc ? "selected" : ""
                }>${escapeHtml(doc)}</option>`,
            )
            .join("")}
        </select>
      </label>
      <label>
        <span>Criticidade</span>
        <select data-filter="severity">
          <option value="ALL">Todas</option>
          ${Object.entries(severityLabels)
            .map(
              ([value, label]) =>
                `<option value="${value}" ${state.severity === value ? "selected" : ""}>${label}</option>`,
            )
            .join("")}
        </select>
      </label>
      <label>
        <span>Status</span>
        <select data-filter="status">
          <option value="ALL">Todos</option>
          ${Object.entries(statusLabels)
            .map(
              ([value, label]) =>
                `<option value="${value}" ${state.status === value ? "selected" : ""}>${label}</option>`,
            )
            .join("")}
        </select>
      </label>
    </section>
  `;
}

function renderChangeCard(change) {
  const enriched = enrichedChange(change);
  const source = sourceFor(change);
  const selected = change.id === state.selectedChangeId ? " is-selected" : "";
  return `
    <article class="alert-card${selected}" data-change-id="${change.id}">
      <button class="alert-main" type="button" data-action="select-change" data-id="${change.id}">
        <span class="card-kicker">
          <span class="${severityClass(change.severity)}">${severityLabels[change.severity]}</span>
          <span class="protocol-stamp">No ${escapeHtml(enriched.protocol)}</span>
        </span>
        <strong>${escapeHtml(enriched.title)}</strong>
        <span>${escapeHtml(source.name)} - ${deadlineLabel(enriched)}</span>
      </button>
      <span class="${statusClass(change.status)}">${statusLabels[change.status]}</span>
    </article>
  `;
}

function renderChangeDetail(change) {
  const enriched = enrichedChange(change);
  const source = sourceFor(change);
  return `
    <div class="detail-stack">
      <div class="detail-title">
        <div class="detail-badges">
          <span class="${severityClass(enriched.severity)}">${severityLabels[enriched.severity]}</span>
          <span class="protocol-stamp">No ${escapeHtml(enriched.protocol)}</span>
        </div>
        <h2>${escapeHtml(enriched.title)}</h2>
        <p>${escapeHtml(source.agency)} - ${formatDateTime(enriched.detectedAt)}</p>
      </div>

      <dl class="definition-grid">
        <div><dt>UF</dt><dd>${escapeHtml(enriched.uf ?? "Nacional")}</dd></div>
        <div><dt>Documento</dt><dd>${escapeHtml(enriched.documents.join(", "))}</dd></div>
        <div><dt>Area</dt><dd>${escapeHtml(enriched.area)}</dd></div>
        <div><dt>Confianca</dt><dd>${enriched.confidence}%</dd></div>
      </dl>

      ${renderMilestoneGrid(enriched)}

      <section class="change-excerpt">
        <h3>Trecho da mudanca detectado</h3>
        <p>${escapeHtml(enriched.changedExcerpt)}</p>
        <a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">
          Abrir URL oficial monitorada
        </a>
      </section>

      <section class="text-block">
        <h3>Resumo IA</h3>
        <p>${escapeHtml(enriched.summary)}</p>
      </section>
      <section class="text-block">
        <h3>Impacto operacional</h3>
        <p>${escapeHtml(enriched.impact)}</p>
      </section>
      <section class="text-block">
        <h3>Acao sugerida</h3>
        <p>${escapeHtml(enriched.action)}</p>
      </section>

      <div class="diff-grid">
        <div>
          <strong>Antes</strong>
          <p>${escapeHtml(enriched.diffBefore)}</p>
        </div>
        <div>
          <strong>Depois</strong>
          <p>${escapeHtml(enriched.diffAfter)}</p>
        </div>
      </div>

      ${
        enriched.evidence
          ? `<div class="evidence-line"><strong>Evidencia</strong><span>${escapeHtml(enriched.evidence)}</span></div>`
          : ""
      }

      <div class="button-row">
        <a class="button" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">Abrir fonte</a>
        ${
          change.status !== "PUBLISHED"
            ? `<button class="button button-primary" type="button" data-action="publish" data-id="${change.id}">Publicar</button>`
            : ""
        }
        ${
          change.status !== "IGNORED"
            ? `<button class="button button-muted" type="button" data-action="ignore" data-id="${change.id}">Ignorar</button>`
            : ""
        }
      </div>
    </div>
  `;
}

function renderMilestoneGrid(change) {
  const milestones = [
    ["Publicacao", change.publicationDate],
    ["Homologacao", change.homologationDate],
    ["Producao", change.productionDate],
    ["Obrigatoriedade", change.effectiveDate],
  ];
  return `
    <div class="milestone-grid">
      ${milestones
        .map(
          ([label, value]) => `
            <div>
              <span>${label}</span>
              <strong>${formatDate(value)}</strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderCalendario() {
  const month = state.calendarMonth;
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(month);
  const cells = buildCalendarCells(month, enrichedCalendarEvents());

  return `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Calendario fiscal</p>
          <h2>${escapeHtml(monthLabel)}</h2>
        </div>
        <div class="button-row">
          <button class="button icon-button" type="button" data-action="month-prev" aria-label="Mes anterior">‹</button>
          <button class="button icon-button" type="button" data-action="month-next" aria-label="Proximo mes">›</button>
        </div>
      </div>
      <div class="calendar-grid" role="grid">
        ${["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"]
          .map((day) => `<strong class="calendar-head">${day}</strong>`)
          .join("")}
        ${cells
          .map(
            (cell) => `
              <div class="calendar-cell ${cell.outside ? "is-outside" : ""}" role="gridcell">
                <span class="calendar-day">${cell.day}</span>
                <div class="calendar-events">
                  ${cell.events
                    .map(
                      (event) => `
                        <button class="calendar-event ${event.severity.toLowerCase()}" type="button" data-action="open-source" data-id="${event.sourceId}">
                          ${escapeHtml(event.title)}
                        </button>
                      `,
                    )
                    .join("")}
                </div>
              </div>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function enrichedCalendarEvents() {
  const fromChanges = store.changes
    .filter((change) => ["PUBLISHED", "IN_REVIEW"].includes(change.status))
    .map((change) => ({
      id: `event-${change.id}`,
      title: change.title,
      date: change.detectedAt.slice(0, 10),
      severity: change.severity,
      status: change.status,
      uf: change.uf,
      documents: change.documents,
      sourceId: change.sourceId,
    }));
  return [...store.calendar, ...fromChanges];
}

function buildCalendarCells(month, events) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const first = new Date(year, monthIndex, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, monthIndex, 1 - startOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const iso = date.toISOString().slice(0, 10);
    return {
      day: date.getDate(),
      outside: date.getMonth() !== monthIndex,
      events: events.filter((event) => event.date === iso),
    };
  });
}

function renderFontes() {
  const sources = store.sources
    .filter((source) => {
      const query = state.query.trim().toLowerCase();
      const haystack = [source.name, source.agency, source.uf, source.documents.join(" ")]
        .join(" ")
        .toLowerCase();
      return !query || haystack.includes(query);
    })
    .sort((a, b) => {
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return a.name.localeCompare(b.name);
    });

  return `
    <section class="filters compact-filter" aria-label="Filtro de fontes">
      <label>
        <span>Busca</span>
        <input type="search" value="${escapeHtml(state.query)}" data-filter="query" placeholder="SEFAZ, NF-e, SP" />
      </label>
      <button class="button" type="button" data-action="reset-demo">Restaurar seed</button>
    </section>
    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">${sources.length} fontes</p>
          <h2>Fontes monitoradas</h2>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fonte</th>
              <th>UF</th>
              <th>Docs</th>
              <th>Freq.</th>
              <th>Crit.</th>
              <th>Ultima checagem</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${sources.map(renderSourceRow).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderSourceRow(source) {
  return `
    <tr>
      <td>
        <strong>${escapeHtml(source.name)}</strong>
        <span>${escapeHtml(source.agency)}</span>
      </td>
      <td>${escapeHtml(source.uf ?? "Nacional")}</td>
      <td>${escapeHtml(source.documents.join(", "))}</td>
      <td>${frequencyLabels[source.frequency]}</td>
      <td><span class="${severityClass(source.severity)}">${severityLabels[source.severity]}</span></td>
      <td>${formatDateTime(source.lastCheckedAt)}</td>
      <td>
        <button class="button table-button" type="button" data-action="check-source" data-id="${source.id}">
          Verificar
        </button>
      </td>
    </tr>
  `;
}

function renderRevisao() {
  const pending = store.changes
    .filter((change) => ["DRAFT", "IN_REVIEW"].includes(change.status))
    .sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);
  return `
    <section class="split-layout review-layout">
      <div class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">${pending.length} pendentes</p>
            <h2>Fila de revisao</h2>
          </div>
        </div>
        <div class="review-list">
          ${
            pending.length
              ? pending.map(renderReviewItem).join("")
              : renderEmpty("Nao ha mudancas aguardando revisao.")
          }
        </div>
      </div>
      <aside class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Regra operacional</p>
            <h2>Publicacao segura</h2>
          </div>
        </div>
        <div class="rule-list">
          <p><strong>Critica</strong> exige validacao humana e notificacao imediata.</p>
          <p><strong>Alta</strong> entra em revisao para Fiscal, Dev, Suporte e CS.</p>
          <p><strong>Media</strong> fica em acompanhamento com historico auditavel.</p>
          <p><strong>Baixa</strong> pode ser ignorada sem apagar snapshots.</p>
        </div>
      </aside>
    </section>
  `;
}

function renderReviewItem(change) {
  const source = sourceFor(change);
  return `
    <article class="review-item">
      <div>
        <span class="${severityClass(change.severity)}">${severityLabels[change.severity]}</span>
        <h3>${escapeHtml(change.title)}</h3>
        <p>${escapeHtml(source.name)} - ${escapeHtml(change.summary)}</p>
      </div>
      <div class="button-row">
        <button class="button button-primary" type="button" data-action="publish" data-id="${change.id}">Publicar</button>
        <button class="button button-muted" type="button" data-action="ignore" data-id="${change.id}">Ignorar</button>
      </div>
    </article>
  `;
}

function renderEmpty(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function bindDynamicActions() {
  document.querySelectorAll("[data-filter]").forEach((input) => {
    input.addEventListener("input", () => {
      state[input.dataset.filter] = input.value;
      render();
    });
  });

  document.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", () => handleAction(element.dataset.action, element.dataset.id));
  });
}

function handleAction(action, id) {
  const handlers = {
    "select-change": () => {
      state.selectedChangeId = id;
      state.view = "avisos";
      setActiveTab();
      render();
    },
    publish: () => updateChangeStatus(id, "PUBLISHED"),
    ignore: () => updateChangeStatus(id, "IGNORED"),
    "export-csv": exportCsv,
    "simulate-check": () => simulateCheck(),
    "check-source": () => simulateCheck(id),
    "open-source": () => {
      const source = byId(store.sources, id);
      if (source) window.open(source.url, "_blank", "noopener");
    },
    "month-prev": () => {
      state.calendarMonth.setMonth(state.calendarMonth.getMonth() - 1);
      render();
    },
    "month-next": () => {
      state.calendarMonth.setMonth(state.calendarMonth.getMonth() + 1);
      render();
    },
    "reset-demo": resetDemo,
  };
  handlers[action]?.();
}

function setActiveTab() {
  document
    .querySelectorAll("[data-view]")
    .forEach((button) => button.classList.toggle("is-active", button.dataset.view === state.view));
}

function updateChangeStatus(id, status) {
  const change = byId(store.changes, id);
  if (!change) return;
  change.status = status;
  saveCollection(storageKeys.changes, store.changes);
  if (status === "PUBLISHED") {
    store.calendar.push({
      id: `cal-${id}`,
      title: change.title,
      date: change.detectedAt.slice(0, 10),
      severity: change.severity,
      status: "VALIDATED",
      uf: change.uf,
      documents: change.documents,
      sourceId: change.sourceId,
    });
    saveCollection(storageKeys.calendar, store.calendar);
  }
  showToast(status === "PUBLISHED" ? "Aviso publicado." : "Mudanca ignorada com historico.");
  render();
}

function simulateCheck(sourceId) {
  const source =
    byId(store.sources, sourceId) ??
    store.sources.find((item) => item.severity === "CRITICAL") ??
    store.sources[0];
  const now = new Date();
  const suffix = String(now.getTime()).slice(-5);
  const change = {
    id: `chg-sim-${suffix}`,
    sourceId: source.id,
    title: `${source.name}: alteracao detectada`,
    protocol: `2026/${String(200 + Number(suffix.slice(-3))).padStart(4, "0")}`,
    detectedAt: now.toISOString(),
    publicationDate: now.toISOString().slice(0, 10),
    homologationDate: addDays(now.toISOString().slice(0, 10), 20),
    productionDate: addDays(now.toISOString().slice(0, 10), 42),
    effectiveDate: addDays(now.toISOString().slice(0, 10), source.severity === "CRITICAL" ? 30 : 60),
    area: ["CRITICAL", "HIGH"].includes(source.severity) ? "Desenvolvimento" : "Fiscal",
    evidence: "captura_automatica_fonte_oficial.pdf",
    severity: source.severity,
    status: ["CRITICAL", "HIGH"].includes(source.severity) ? "IN_REVIEW" : "DRAFT",
    theme: source.documents.includes("NF-e") ? "Validacao fiscal" : "Outro",
    uf: source.uf,
    documents: source.documents,
    confidence: source.severity === "CRITICAL" ? 91 : 82,
    summary:
      "O hash normalizado mudou apos remocao de menus, rodapes, banners e datas dinamicas.",
    impact:
      "A mudanca precisa ser comparada com a fonte oficial antes de comunicacao externa.",
    action: "Abrir a fonte, validar o diff e decidir entre publicar, editar ou ignorar.",
    diffBefore: `Hash anterior ${source.lastHash ?? "sem snapshot"}.`,
    diffAfter: `Novo hash normalizado ${Math.random().toString(16).slice(2, 8)}.`,
    changedExcerpt:
      "Conteudo oficial normalizado apresentou alteracao em trecho tecnico ligado a documento fiscal, prazo ou regra de validacao.",
  };
  source.lastCheckedAt = now.toISOString();
  source.lastHash = Math.random().toString(16).slice(2, 8);
  store.changes.unshift(change);
  saveCollection(storageKeys.sources, store.sources);
  saveCollection(storageKeys.changes, store.changes);
  state.selectedChangeId = change.id;
  state.view = "avisos";
  setActiveTab();
  showToast("Verificacao manual registrada.");
  render();
}

function exportCsv() {
  const rows = [
    [
      "protocolo",
      "titulo",
      "fonte",
      "uf",
      "documentos",
      "criticidade",
      "status",
      "obrigatoriedade",
      "detectado_em",
    ],
    ...filteredChanges().map((change) => {
      const enriched = enrichedChange(change);
      const source = sourceFor(change);
      return [
        enriched.protocol,
        enriched.title,
        source.name,
        enriched.uf ?? "Nacional",
        enriched.documents.join(", "),
        severityLabels[enriched.severity],
        statusLabels[enriched.status],
        enriched.effectiveDate,
        enriched.detectedAt,
      ];
    }),
  ];
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "avisos-fiscais.csv";
  link.click();
  URL.revokeObjectURL(url);
  showToast("CSV gerado.");
}

function resetDemo() {
  store.changes = structuredClone(changeSeed);
  store.sources = structuredClone(sourceSeed);
  store.calendar = structuredClone(calendarSeed);
  saveCollection(storageKeys.changes, store.changes);
  saveCollection(storageKeys.sources, store.sources);
  saveCollection(storageKeys.calendar, store.calendar);
  state.selectedChangeId = "chg-nfe-nt-2026";
  showToast("Seed inicial restaurado.");
  render();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

bindShell();
render();
