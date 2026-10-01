(() => {
  "use strict";

  const SLOT_ORDER = ["top", "bottom", "shoes", "accessory"];
  const SLOT_LABELS = { top: "Top", bottom: "Bottom", shoes: "Shoes", accessory: "Accessory" };
  const CORE_SLOTS = ["top", "bottom", "shoes"];
  const BUDGETS = ["all", "budget", "mid", "premium"];
  const COLORS = ["all", "neutral", "warm"];
  const RESOLVE_URL = "http://127.0.0.1:8793/resolve";
  const DEFAULT_INDITEX_BRANDS = [
    "Zara",
    "Pull&Bear",
    "Massimo Dutti",
    "Bershka",
    "Stradivarius",
    "Oysho",
    "Lefties",
  ];
  const BUDGET_RANK = { budget: 1, mid: 2, premium: 3 };

  const state = {
    catalog: null,
    query: "",
    occasion: "all",
    budget: "all",
    color: "all",
    brand: "all",
    lockedPiece: null,
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

  function catalogBrands(catalog) {
    if (Array.isArray(catalog?.brands) && catalog.brands.length) return catalog.brands;
    return DEFAULT_INDITEX_BRANDS;
  }

  function isInditexFocused(catalog) {
    if (Array.isArray(catalog?.brands) && catalog.brands.length) return true;
    const pieces = catalog?.pieces || [];
    if (!pieces.length) return false;
    const nonGoogle = pieces.filter((p) => p.shopUrl && !/google\.com/i.test(p.shopUrl)).length;
    return nonGoogle > pieces.length / 2;
  }

  function pieceHasBrand(piece, brand) {
    const target = String(brand).toLowerCase();
    return (piece.brands || []).some((b) => String(b).toLowerCase() === target);
  }

  function piecePassesBudget(piece) {
    if (state.budget === "all") return true;
    return (BUDGET_RANK[piece.budget] || 2) <= BUDGET_RANK[state.budget];
  }

  function deriveBudget(pieces) {
    const max = Math.max(...pieces.map((p) => BUDGET_RANK[p.budget] || 2));
    if (max <= 1) return "budget";
    if (max <= 2) return "mid";
    return "premium";
  }

  function comboMatchesFilters(combo, pieces, formula, { ignoreLockedBudget = false } = {}) {
    if (state.occasion !== "all" && combo.formulaId !== state.occasion) return false;
    if (state.budget !== "all") {
      const relevant = ignoreLockedBudget ? pieces.filter((p) => !p.locked) : pieces;
      if (relevant.length) {
        const maxPiece = Math.max(...relevant.map((p) => BUDGET_RANK[p.budget] || 2));
        if (maxPiece > BUDGET_RANK[state.budget]) return false;
      }
    }
    if (state.color !== "all") {
      const has = pieces.some((p) => p.colorFamily === state.color);
      if (state.color === "warm" && !has) return false;
      if (state.color === "neutral" && pieces.every((p) => p.colorFamily !== "neutral")) return false;
    }
    if (state.brand !== "all") {
      if (!pieces.some((p) => pieceHasBrand(p, state.brand))) return false;
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

  function scorePieceCandidate(piece, formula, hints) {
    let score = 1;
    const tagSet = new Set(piece.tags || []);
    const hay = [piece.name, piece.fabric, ...(piece.colors || []), ...(piece.tags || []), ...(piece.brands || [])]
      .join(" ")
      .toLowerCase();

    for (const h of hints || []) {
      const hl = String(h).toLowerCase();
      if (tagSet.has(h) || tagSet.has(hl)) score += 12;
      else if (hay.includes(hl)) score += 6;
    }
    for (const t of formula?.tags || []) {
      if (tagSet.has(t)) score += 4;
    }
    if (state.budget !== "all" && piece.budget === state.budget) score += 5;
    if (state.color === "warm" && piece.colorFamily === "warm") score += 8;
    if (state.color === "neutral" && piece.colorFamily === "neutral") score += 5;
    if (state.brand !== "all" && pieceHasBrand(piece, state.brand)) score += 8;
    if (state.query.trim()) {
      for (const t of tokens(state.query)) {
        if (hay.includes(t)) score += 6;
      }
    }
    return score;
  }

  function slotCandidates(catalog, slot, formula, limit = 2) {
    const hints = (formula.slots && formula.slots[slot]) || [];
    const ranked = catalog.pieces
      .filter((p) => p.slot === slot && piecePassesBudget(p))
      .map((p) => ({ p, s: scorePieceCandidate(p, formula, hints) }))
      .sort((a, b) => b.s - a.s);

    if (!ranked.length) return [];

    const matched = hints.length ? ranked.filter((x) => x.s >= 7) : ranked;
    const pool = (matched.length ? matched : ranked).slice(0, limit);
    return pool.map((x) => x.p);
  }

  function pickAccessory(catalog, formula, usedIds) {
    const hints = (formula.slots && formula.slots.accessory) || [];
    const ranked = catalog.pieces
      .filter((p) => p.slot === "accessory" && !usedIds.has(p.id) && piecePassesBudget(p))
      .map((p) => ({ p, s: scorePieceCandidate(p, formula, hints) }))
      .sort((a, b) => b.s - a.s);

    if (!ranked.length) return null;
    const best = ranked[0];
    if (hints.length && best.s >= 7) return best.p;
    if (!hints.length && best.s >= 20) return best.p;
    return null;
  }

  function cartesian(lists) {
    return lists.reduce(
      (acc, list) => {
        const next = [];
        for (const prefix of acc) {
          for (const item of list) next.push([...prefix, item]);
        }
        return next;
      },
      [[]]
    );
  }

  function rebuildCombosAroundLock(catalog) {
    const locked = state.lockedPiece;
    if (!locked) return [];

    const formulas = catalog.formulas.filter(
      (f) => state.occasion === "all" || f.id === state.occasion
    );
    const resolved = [];

    for (const formula of formulas) {
      const fillSlots = CORE_SLOTS.filter((s) => s !== locked.slot);
      const candidateLists = fillSlots.map((slot) => slotCandidates(catalog, slot, formula, 2));
      if (candidateLists.some((list) => !list.length)) continue;

      const variants = cartesian(candidateLists).slice(0, 4);

      for (const picked of variants) {
        const bySlot = { [locked.slot]: locked };
        for (const p of picked) bySlot[p.slot] = p;

        if (locked.slot !== "accessory") {
          const used = new Set([locked.id, ...picked.map((p) => p.id)]);
          const acc = pickAccessory(catalog, formula, used);
          if (acc) bySlot.accessory = acc;
        }

        if (!bySlot.top || !bySlot.bottom || !bySlot.shoes) continue;
        if (locked.slot === "accessory" && !bySlot.accessory) continue;

        const pieces = SLOT_ORDER.map((s) => bySlot[s]).filter(Boolean);
        const budget = deriveBudget(pieces);
        const combo = {
          id: `locked-${formula.id}-${pieces
            .filter((p) => !p.locked)
            .map((p) => p.id)
            .join("-")}`,
          formulaId: formula.id,
          pieceIds: pieces.map((p) => p.id),
          why: `Built around your ${locked.name} for ${formula.name}.`,
          budget,
        };

        if (!comboMatchesFilters(combo, pieces, formula, { ignoreLockedBudget: true })) continue;

        const hintBonus = pieces
          .filter((p) => !p.locked)
          .reduce((sum, p) => {
            const hints = (formula.slots && formula.slots[p.slot]) || [];
            return sum + Math.min(scorePieceCandidate(p, formula, hints), 30);
          }, 0);

        resolved.push({
          combo,
          pieces,
          formula,
          score: scoreCombo(combo, pieces, formula) + Math.floor(hintBonus / 4) + 25,
        });
      }
    }

    resolved.sort((a, b) => b.score - a.score);
    return resolved;
  }

  function resolveCombos(catalog) {
    if (state.lockedPiece) return rebuildCombosAroundLock(catalog);

    const pMap = pieceMap(catalog);
    const fMap = formulaMap(catalog);
    const resolved = [];

    for (const combo of catalog.combos) {
      const pieces = combo.pieceIds.map((id) => pMap.get(id)).filter(Boolean);
      const slots = new Set(pieces.map((p) => p.slot));
      if (!slots.has("top") || !slots.has("bottom") || !slots.has("shoes")) continue;
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
    const brands = catalogBrands(catalog);
    const brandOptions = ["all", ...brands];
    const brandLabels = { all: "All", ...Object.fromEntries(brands.map((b) => [b, b])) };

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

    renderChips($("#brand-chips"), brandOptions, state.brand, (v) => {
      state.brand = v;
      render();
    }, brandLabels);
  }

  function pieceImageUrl(piece) {
    const src = piece?.image;
    if (!src) return null;
    if (/^https?:\/\//i.test(src)) return src;
    return src;
  }

  function renderLookLayer(piece) {
    const slot = piece.slot;
    const label = SLOT_LABELS[slot] || slot;
    const src = pieceImageUrl(piece);
    const family = piece.colorFamily === "warm" ? "warm" : "neutral";
    if (!src) {
      return `
        <div class="look-layer look-layer--${escapeHtml(slot)} is-missing look-family--${family}" data-slot="${escapeHtml(slot)}">
          <span class="look-fallback">${escapeHtml(label)}</span>
        </div>
      `;
    }
    const alt = piece.imageAlt || piece.name || label;
    return `
      <div class="look-layer look-layer--${escapeHtml(slot)} look-family--${family}" data-slot="${escapeHtml(slot)}">
        <img
          src="${escapeHtml(src)}"
          alt="${escapeHtml(alt)}"
          loading="lazy"
          onerror="this.closest('.look-layer').classList.add('is-missing'); this.remove();"
        />
        <span class="look-fallback">${escapeHtml(label)}</span>
      </div>
    `;
  }

  function renderLookStage(ordered) {
    return `
      <div class="look-stage" aria-label="Outfit preview">
        ${ordered.map(renderLookLayer).join("")}
      </div>
    `;
  }

  function renderSlot(piece) {
    const colors = (piece.colors || []).join(", ");
    const brandList = (piece.brands || []).slice(0, 3);
    const brands = brandList.join(", ");
    const brandHint = brands
      ? `<span class="brand-hint"><span class="brand-hint-label">Brands</span> ${escapeHtml(brands)}</span>`
      : "";
    const src = pieceImageUrl(piece);
    const alt = piece.imageAlt || piece.name || "";
    const thumb = src
      ? `<img class="slot-thumb" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" onerror="this.classList.add('is-missing'); this.removeAttribute('src');" />`
      : `<div class="slot-thumb slot-thumb--empty" aria-hidden="true"></div>`;
    const shopHref = piece.shopUrl || "#";
    const lockedClass = piece.locked ? " is-locked" : "";
    const priceText = piece.priceLabel || (piece.price != null && piece.price !== "" ? String(piece.price) : "");
    const priceSpan = priceText
      ? ` · <span class="slot-price">${escapeHtml(priceText)}</span>`
      : "";
    return `
      <article class="slot-section${lockedClass}">
        <div class="slot-row">
          ${thumb}
          <div class="slot-body">
            <p class="slot-label">${escapeHtml(SLOT_LABELS[piece.slot] || piece.slot)}</p>
            <h3 class="slot-name">${escapeHtml(piece.name)}</h3>
            <p class="slot-meta">${escapeHtml(piece.fabric)} · ${escapeHtml(colors)} · ${escapeHtml(piece.budget)}${priceSpan}</p>
            <div class="slot-actions">
              <a class="btn-shop" href="${escapeHtml(shopHref)}" target="_blank" rel="noopener">
                Shop this
              </a>
              ${brandHint}
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function orderedPieces(pieces) {
    const bySlot = {};
    for (const p of pieces) {
      if (p?.slot) bySlot[p.slot] = p;
    }
    if (state.lockedPiece?.slot === "accessory" && !bySlot.accessory) {
      bySlot.accessory = state.lockedPiece;
    }
    return SLOT_ORDER.map((slot) => bySlot[slot]).filter(Boolean);
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
        ${renderLookStage(ordered)}
        <div class="slot-stack">
          ${ordered.map(renderSlot).join("")}
        </div>
      </article>
    `;
  }

  function renderLockedBanner(lp) {
    const price = lp.priceLabel
      ? ` · <span class="slot-price">${escapeHtml(lp.priceLabel)}</span>`
      : "";
    const slot = SLOT_LABELS[lp.slot] || lp.slot;
    return `
      <div class="locked-banner" role="status">
        <span>Looks built around <strong>${escapeHtml(lp.name)}</strong>${price} · ${escapeHtml(slot)}</span>
        <button type="button" class="btn-secondary" id="banner-clear-lock">Clear</button>
      </div>
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
      const empty = state.lockedPiece
        ? `<p class="empty">No outfits fit around that piece with the current filters. Try clearing a filter.</p>`
        : `<p class="empty">No outfits match. Try another occasion or clear a filter.</p>`;
      const banner = state.lockedPiece ? renderLockedBanner(state.lockedPiece) : "";
      root.innerHTML = banner + empty;
      wireBannerClear();
      return;
    }

    const [featured, ...rest] = matches;
    const shopNote = isInditexFocused(catalog)
      ? "Inditex brand shop links"
      : "market search links open Google Shopping";
    const meta = `${matches.length} look${matches.length === 1 ? "" : "s"} · ${shopNote}`;
    let html = `<p class="results-meta">${escapeHtml(meta)}</p>`;
    if (state.lockedPiece) html += renderLockedBanner(state.lockedPiece);
    html += renderCombo(featured, { featured: true });
    if (rest.length) {
      html += `<h2 class="more-heading">More combos</h2>`;
      html += rest.map((m) => renderCombo(m)).join("");
    }
    root.innerHTML = html;
    wireBannerClear();
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

  function setProductStatus(msg, isError = false) {
    const el = $("#product-status");
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("is-error", !!isError);
  }

  function lockedPieceFromResolve(data) {
    const slot = data.slot || "top";
    return {
      id: "locked-" + slot,
      slot,
      name: data.name || "Locked piece",
      fabric: data.family || data.kind || "",
      colors: Array.isArray(data.colors) ? data.colors : [],
      colorFamily: "neutral",
      budget: "mid",
      brands: [data.brand || "Zara"],
      tags: Array.isArray(data.tags) ? data.tags : [],
      shopQuery: data.name || "",
      shopUrl: data.shopUrl || data.url || "",
      image: data.image || "",
      imageAlt: data.name || "Locked piece",
      price: data.price,
      currency: data.currency,
      priceLabel: data.priceLabel,
      locked: true,
    };
  }

  function clearLockedPiece() {
    state.lockedPiece = null;
    const clearBtn = $("#product-clear");
    if (clearBtn) clearBtn.hidden = true;
    setProductStatus("");
    const input = $("#product-url");
    if (input) input.value = "";
    render();
  }

  function wireBannerClear() {
    const btn = $("#banner-clear-lock");
    if (!btn) return;
    btn.addEventListener("click", () => clearLockedPiece());
  }

  function wireProductForm() {
    const form = $("#product-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = $("#product-url");
      const url = (input?.value || "").trim();
      if (!url) {
        setProductStatus("Paste a product URL first.", true);
        return;
      }

      setProductStatus("Resolving product…");
      try {
        const res = await fetch(RESOLVE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        let data;
        try {
          data = await res.json();
        } catch {
          setProductStatus("Resolver returned an invalid response.", true);
          return;
        }

        if (!data.ok) {
          setProductStatus(data.error || data.message || "Could not resolve that product.", true);
          return;
        }

        state.lockedPiece = lockedPieceFromResolve(data);
        const lp = state.lockedPiece;
        const priceBit = lp.priceLabel ? ` · ${lp.priceLabel}` : "";
        setProductStatus(`Locked ${SLOT_LABELS[lp.slot] || lp.slot}: ${lp.name}${priceBit}`);
        const clearBtn = $("#product-clear");
        if (clearBtn) clearBtn.hidden = false;
        render();
        $("#results")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch {
        setProductStatus(
          "Could not reach local resolver. Start it with: python tools/resolve_product.py --serve",
          true
        );
      }
    });

    const clearBtn = $("#product-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => clearLockedPiece());
    }
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

    wireProductForm();

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
