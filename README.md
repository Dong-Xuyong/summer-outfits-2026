# Summer Outfits 2026

Personal outfit builder for casual men's summer 2026 looks from Inditex brands
(Zara, Pull&Bear, Massimo Dutti, Bershka, Stradivarius, Oysho, Lefties), based on the
[last30days archive report](https://dong-xuyong.github.io/last30days-archive/#/report/every-outfit-for-men-in-2026-summer).

**Live:** https://dong-xuyong.github.io/summer-outfits-2026/

Autumn 2026 is a second page (`autumn.html`) with the same search, filters, and
Top / Outer / Bottom / Shoes layout. It lists three looks with full EUR prices from
the brands' Portugal sites (verified 11 Oct 2026):

- Everyday casual — 135,88 €
- Rainy cooler day — 205,80 € (all Zara; try on at Espaço Guimarães)
- Smart-casual date — 408,85 € (all Massimo Dutti)

Catalog: `data/autumn-catalog.json`. Outfit collages and piece photos live in
`assets/autumn/` (local copies, not hotlinked).

## Features

- Search by occasion or keyword (dinner, linen, Zara, travel…) — brand names match too
- Filter by occasion, budget, color family, and Inditex brand
- Visual look stage: Top / Bottom / Shoes images stacked into one outfit
- Recommended full looks with separate **Top / Bottom / Shoes** sections + brand shop links
- **Product URL personalization** — paste a Zara (or Inditex) product link; a local resolver fetches the piece and personalizes the outfit around it
- **Accessories slot** — belts, bags, jewelry, and other extras can be included when personalizing from a product link
- Capsule rules from the research report

## Stack

Plain HTML/CSS/JS, no build step. Summer catalog lives in `data/catalog.json`;
autumn catalog in `data/autumn-catalog.json` (same shape: formulas, pieces, combos).
Summer piece flat-lays live in `assets/pieces/<piece-id>.png` (AI-generated illustrative art; see `assets/ATTRIBUTION.md`).
Autumn uses real brand product photos saved under `assets/autumn/`.
Theme tokens from vendored `dong-ui/`.

## Run locally

You need two terminals — static files and the product URL resolver:

```bash
cd summer-outfits-2026
python -m http.server 8792
# other terminal:
python tools/resolve_product.py --serve
# open http://localhost:8792
# autumn: http://localhost:8792/autumn.html
```

Product URL personalization only works when the local resolver is running. GitHub Pages cannot resolve live product URLs until a hosted proxy exists; the deployed site still supports catalog search and filters.

## Deploy

From the Second Brain repo root:

```bash
python scripts/sync_summer_outfits.py
```

Pushes this folder to [`Dong-Xuyong/summer-outfits-2026`](https://github.com/Dong-Xuyong/summer-outfits-2026)
(GitHub Pages).
