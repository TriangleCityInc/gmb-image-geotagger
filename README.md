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

> The passphrase is set at the top of `app.js` as `PASSPHRASE = "CHANGE_ME"`. This is obscurity only — change it before deploying, and use real auth (Cloudflare Access) on the public subdomain.

## Deployment (GitHub Pages + custom subdomain)

1. Create a GitHub repo and push these files to `main`.
2. Repo Settings → Pages → **Deploy from a branch** → `main` → `/ (root)`.
3. The `CNAME` file in this repo contains `photos.buildnetpro.com` — GitHub Pages picks it up automatically.
4. In Cloudflare DNS, add a CNAME record:
   - **Name:** `photos`
   - **Target:** `<myusername>.github.io`
   - **Proxy:** on (orange cloud)
   Wait for GitHub Pages to provision the HTTPS certificate (a few minutes once DNS resolves).
5. **Optional real auth:** Cloudflare Zero Trust → Access → create an application for `photos.buildnetpro.com` and a policy that allows only your email.

## How it works

1. Enter business name, pick a niche (auto-fills a keyword pool you can edit), set your city/region.
2. Drop photos onto the upload zone (PNG / JPG / WEBP — HEIC not supported).
3. Click the map to drop a pin for your general business area.
4. Tune settings:
   - **Jitter radius (m)** — keep tight around your real area; wide scatter can hurt city-name rankings.
   - **Timestamp spread (days)** — capture dates randomized across last N days, daylight hours only.
   - **JPEG quality** — 0.85 default.
   - **Drip batches** — split output into N subfolders with timestamps clustered in different recent windows.
5. **Preview** — see the proposed filenames and jittered coordinates plotted on the map.
6. **Process & Download** — generates `photo-prep-export.zip` with all processed JPEGs and a `manifest.csv` (filename, batch, latitude, longitude, capture_datetime, low_res).

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
