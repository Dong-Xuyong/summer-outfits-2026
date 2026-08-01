(() => {
  "use strict";

  const SLOT_ORDER = ["top", "bottom", "shoes"];
  const SLOT_LABELS = { top: "Top", bottom: "Bottom", shoes: "Shoes" };
  const BUDGETS = ["all", "budget", "mid", "premium"];
  const COLORS = ["all", "neutral", "warm"];

  const state = {
    catalog: null,
    query: "",
    occasion: "all",
    budget: "all",
    color: "all",
  };

  const $ = (sel, el = document) => el.querySelector(sel);

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pieceMap(catalog) {
    const map = new Map();
    for (const p of catalog.pieces) map.set(p.id, p);
    return map;
  }

  function formulaMap(catalog) {
    const map = new Map();
    for (const f of catalog.formulas) map.set(f.id, f);
    return map;
  }

  function tokens(text) {
    return text
      .toLowerCase()
      .split(/[^a-z0-9+]+/)
      .filter(Boolean);
  }

  function comboMatchesFilters(combo, pieces, formula) {
    if (state.occasion !== "all" && combo.formulaId !== state.occasion) return false;
    if (state.budget !== "all") {
      const rank = { budget: 1, mid: 2, premium: 3 };
      const budgets = pieces.map((p) => p.budget);
      const maxPiece = Math.max(...budgets.map((b) => rank[b] || 2));
      if (maxPiece > rank[state.budget]) return false;
    }
    if (state.color !== "all") {
      const has = pieces.some((p) => p.colorFamily === state.color);
      if (state.color === "warm" && !has) return false;
      if (state.color === "neutral" && pieces.every((p) => p.colorFamily !== "neutral")) return false;
    }
    if (state.query.trim()) {
      const hay = [
        formula?.name,
        formula?.blurb,
        ...(formula?.tags || []),
        combo.why,
        ...pieces.flatMap((p) => [p.name, p.fabric, ...(p.colors || []), ...(p.tags || []), ...(p.brands || [])]),
      ]
        .join(" ")
        .toLowerCase();
      const q = tokens(state.query);
      if (!q.every((t) => hay.includes(t))) return false;
    }
    return true;
  }

  function scoreCombo(combo, pieces, formula) {
    let score = 10;
    if (state.occasion !== "all" && combo.formulaId === state.occasion) score += 50;
    if (state.query.trim()) {
      const q = tokens(state.query);
      const hay = [formula?.name, combo.why, ...pieces.map((p) => p.name)].join(" ").toLowerCase();
      for (const t of q) {
        if (hay.includes(t)) score += 8;
      }
    }
    if (state.budget !== "all" && combo.budget === state.budget) score += 5;
    return score;
  }

  function resolveCombos(catalog) {
    const pMap = pieceMap(catalog);
    const fMap = formulaMap(catalog);
    const resolved = [];

    for (const combo of catalog.combos) {
      const pieces = combo.pieceIds.map((id) => pMap.get(id)).filter(Boolean);
      if (pieces.length !== 3) continue;
      const formula = fMap.get(combo.formulaId);
      if (!comboMatchesFilters(combo, pieces, formula)) continue;
      resolved.push({
        combo,
        pieces,
        formula,
        score: scoreCombo(combo, pieces, formula),
      });
    }

    resolved.sort((a, b) => b.score - a.score);
    return resolved;
  }

  function renderChips(container, options, active, onPick, labels = {}) {
    container.innerHTML = options
      .map((id) => {
        const label = labels[id] || (id === "all" ? "All" : id.replace(/-/g, " "));
        const cls = id === active ? "chip active" : "chip";
        return `<button type="button" class="${cls}" data-value="${escapeHtml(id)}" role="option" aria-selected="${id === active}">${escapeHtml(label)}</button>`;
      })
      .join("");
    container.querySelectorAll(".chip").forEach((btn) => {
      btn.addEventListener("click", () => onPick(btn.dataset.value));
    });
  }

  function renderFilters(catalog) {
    const occasions = ["all", ...catalog.formulas.map((f) => f.id)];
    const occasionLabels = { all: "All", ...Object.fromEntries(catalog.formulas.map((f) => [f.id, f.name])) };
    const budgetLabels = { all: "All", budget: "Budget", mid: "Mid", premium: "Premium" };
    const colorLabels = { all: "All", neutral: "Neutral", warm: "Warm muted" };

    renderChips($("#occasion-chips"), occasions, state.occasion, (v) => {
      state.occasion = v;
      render();
    }, occasionLabels);

    renderChips($("#budget-chips"), BUDGETS, state.budget, (v) => {
      state.budget = v;
      render();
    }, budgetLabels);

    renderChips($("#color-chips"), COLORS, state.color, (v) => {
      state.color = v;
      render();
    }, colorLabels);
  }

  function renderSlot(piece) {
    const colors = (piece.colors || []).join(", ");
    const brands = (piece.brands || []).slice(0, 3).join(", ");
    return `
      <article class="slot-section">
        <p class="slot-label">${escapeHtml(SLOT_LABELS[piece.slot] || piece.slot)}</p>
        <h3 class="slot-name">${escapeHtml(piece.name)}</h3>
        <p class="slot-meta">${escapeHtml(piece.fabric)} · ${escapeHtml(colors)} · ${escapeHtml(piece.budget)}</p>
        <div class="slot-actions">
          <a class="btn-shop" href="${escapeHtml(piece.shopUrl)}" target="_blank" rel="noopener">
            Shop this
          </a>
          <span class="brand-hint">${escapeHtml(brands)}</span>
        </div>
      </article>
    `;
  }

  function orderedPieces(pieces) {
    return SLOT_ORDER.map((slot) => pieces.find((p) => p.slot === slot)).filter(Boolean);
  }

  function renderCombo(item, { featured = false } = {}) {
    const { combo, pieces, formula } = item;
    const ordered = orderedPieces(pieces);
    const kicker = featured ? "Recommended look" : "Alternate look";
    const title = formula?.name || "Outfit";
    return `
      <article class="combo ${featured ? "featured" : "alt"}">
        <header class="combo-header">
          <p class="combo-kicker">${kicker}</p>
          <h2 class="combo-title">${escapeHtml(title)}</h2>
          <p class="combo-why">${escapeHtml(combo.why)}</p>
          <div class="combo-badges">
            <span class="badge">${escapeHtml(combo.budget || "mixed")}</span>
            ${(formula?.tags || []).slice(0, 3).map((t) => `<span class="badge">${escapeHtml(t)}</span>`).join("")}
          </div>
        </header>
        <div class="slot-stack">
          ${ordered.map(renderSlot).join("")}
        </div>
      </article>
    `;
  }

  function renderResults() {
    const root = $("#results");
    const catalog = state.catalog;
    if (!catalog) {
      root.innerHTML = `<p class="loading">Loading catalog…</p>`;
      return;
    }

    const matches = resolveCombos(catalog);
    if (!matches.length) {
      root.innerHTML = `<p class="empty">No outfits match. Try another occasion or clear a filter.</p>`;
      return;
    }

    const [featured, ...rest] = matches;
    const meta = `${matches.length} look${matches.length === 1 ? "" : "s"} · market search links open Google Shopping`;
    let html = `<p class="results-meta">${escapeHtml(meta)}</p>`;
    html += renderCombo(featured, { featured: true });
    if (rest.length) {
      html += `<h2 class="more-heading">More combos</h2>`;
      html += rest.map((m) => renderCombo(m)).join("");
    }
    root.innerHTML = html;
  }

  function renderPatterns(catalog) {
    const list = $("#patterns-list");
    list.innerHTML = (catalog.keyPatterns || [])
      .map((p) => `<li>${escapeHtml(p)}</li>`)
      .join("");
    const link = $("#source-report");
    if (catalog.sourceReport) link.href = catalog.sourceReport;
  }

  function render() {
    if (state.catalog) renderFilters(state.catalog);
    renderResults();
  }

  async function init() {
    if (window.DongUI) window.DongUI.initTheme();

    $("#search-form").addEventListener("submit", (e) => {
      e.preventDefault();
      state.query = $("#search-input").value;
      render();
      $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    $("#search-input").addEventListener("input", (e) => {
      state.query = e.target.value;
      render();
    });

    try {
      const res = await fetch("data/catalog.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.catalog = await res.json();
      renderPatterns(state.catalog);
      render();
    } catch (err) {
      $("#results").innerHTML = `<p class="empty">Could not load catalog: ${escapeHtml(err.message)}</p>`;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
