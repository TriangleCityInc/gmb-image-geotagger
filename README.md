# Photo Prep

Private, client-side web app for preparing business photos for Google Business Profile uploads.

- Strips existing metadata (PNG → JPEG conversion drops it).
- Embeds realistic GPS + timestamp EXIF, jittered per photo around a pin you set.
- Renames files organically using niche keywords.
- Packages everything into a ZIP with a `manifest.csv`.
- Runs entirely in the browser. No backend. No npm. No build step.

## Local preview

```
python3 -m http.server 8000
```

Then open `http://localhost:8000` and enter the passphrase.

> The passphrase is set at the top of `app.js` as `PASSPHRASE`. **It is obscurity only** — the whole script ships to the browser, so anyone who loads the page can read it via DevTools. Treat the gate as a speed bump, not security. Use a value that is not reused on any other account.

## Deployment — GitHub Pages

Live at: `https://trianglecityinc.github.io/gmb-image-geotagger/`

Source: `main` branch, `/` root. Enabled via Repo Settings → Pages → *Deploy from a branch*. Every push to `main` triggers a rebuild (usually live within ~60 seconds).

To deploy a change:

```
git add -A
git commit -m "describe the change"
git push
```

## How it works

1. Enter business name, pick a niche (auto-fills a keyword pool you can edit), set your city/region.
2. Drop photos onto the upload zone (PNG / JPG / WEBP — HEIC not supported).
3. Click the map to drop a pin for your general business area.
4. Tune the **Jitter radius (m)** slider — keep tight around your real area; wide scatter can hurt city-name rankings. (Timestamp spread is fixed at 100 days; JPEG quality is fixed at 0.92.)
5. **Preview** — see the proposed filenames and jittered coordinates plotted on the map.
6. **Process & Download** — generates `photo-prep-export.zip` with all processed JPEGs and a `manifest.csv` (filename, latitude, longitude, capture_datetime, low_res).

## Per-photo pipeline

1. Decode to canvas, downscale longest side to 2048px max (no upscaling). Flag images with smaller dimension < 720px as `low_res` in the manifest.
2. Encode JPEG at chosen quality; auto-drop quality until ≤ 5 MB.
3. Build fresh EXIF (GPS lat/lng jittered, `DateTimeOriginal`/`Digitized`, plausible phone Make/Model).
4. Embed EXIF with piexifjs, package in JSZip.

## Libraries (CDN only)

- [Leaflet](https://leafletjs.com/) + OpenStreetMap tiles
- [piexifjs](https://github.com/hMatoba/piexifjs)
- [JSZip](https://stuk.github.io/jszip/)
- [FileSaver.js](https://github.com/eligrey/FileSaver.js/)
