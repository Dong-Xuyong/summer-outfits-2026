# Summer Outfits 2026

Personal outfit builder for men's summer 2026 looks, based on the
[last30days archive report](https://dong-xuyong.github.io/last30days-archive/#/report/every-outfit-for-men-in-2026-summer).

**Live:** https://dong-xuyong.github.io/summer-outfits-2026/

## Features

- Search by occasion or keyword (dinner, linen, loafers, travel…)
- Filter by budget and color family
- Recommended full looks with separate **Top / Bottom / Shoes** sections
- Shop links via Google Shopping search queries (curated catalog, no live APIs)
- Capsule rules from the research report

## Stack

Plain HTML/CSS/JS, no build step. Catalog lives in `data/catalog.json`.
Theme tokens from vendored `dong-ui/`.

## Run locally

```bash
cd summer-outfits-2026
python -m http.server 8792
# open http://localhost:8792
```

## Deploy

From the Second Brain repo root:

```bash
python scripts/sync_summer_outfits.py
```

Pushes this folder to [`Dong-Xuyong/summer-outfits-2026`](https://github.com/Dong-Xuyong/summer-outfits-2026)
(GitHub Pages).
