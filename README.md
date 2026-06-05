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

> The passphrase is set at the top of `app.js` as `PASSPHRASE`. This is obscurity only — for real protection put the subdomain behind Cloudflare Access (Zero Trust) or HTTP Basic auth at the web-server level.

## Deployment — Hostinger (shared hosting)

**Target URL:** `https://geotagger.buildnetpro.com`
**Target path:** `/home/u194886637/domains/buildnetpro.com/public_html/geotagger`

1. **Create the subdomain in hPanel**
   - hPanel → Domains → Subdomains
   - Subdomain: `geotagger`, Domain: `buildnetpro.com`
   - Document root: `public_html/geotagger` (Hostinger creates the folder automatically)
2. **Upload the files** into that folder. Use either:
   - **File Manager** (hPanel → Files → File Manager → navigate to `public_html/geotagger`, upload everything except `.git/`), or
   - **SFTP / FTP** (hPanel → Files → FTP Accounts gives you host/user/password; point your client to `public_html/geotagger`).
   Files to upload: `index.html`, `app.js`, `styles.css` (the README and `.gitignore` are optional on the server).
3. **DNS** — if buildnetpro.com uses Hostinger's nameservers, creating the subdomain in step 1 also creates the DNS record. If DNS is at Cloudflare, add a record there pointing `geotagger` → your Hostinger server (Hostinger shows the A-record IP under hPanel → Domain → DNS Zone Editor). Proxy through Cloudflare if you want their TLS + WAF.
4. **HTTPS** — Hostinger auto-issues a Let's Encrypt cert for the subdomain once DNS resolves. If DNS is proxied through Cloudflare instead, Cloudflare handles TLS at the edge.
5. **Optional real auth** — Cloudflare Zero Trust → Access → application for `geotagger.buildnetpro.com` → policy allowing only your email. Highly recommended; the in-page passphrase is just obscurity.

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
