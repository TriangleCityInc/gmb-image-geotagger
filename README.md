# Photo Prep

Private, client-side web app for preparing business photos for Google Business Profile uploads.

- Strips existing metadata (PNG → JPEG conversion drops it).
- Embeds realistic GPS + timestamp EXIF, jittered per photo around a pin you set.
- Renames files organically using niche keywords.
- Packages everything into a ZIP.
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

## Deployment — OpenAI keyword proxy (Hostinger, one time)

`app.js` calls a PHP file on Hostinger to generate niche-specific keyword pools. The OpenAI key lives inside that PHP file (server-side only) so the browser never sees it. One-time setup:

1. **In this repo:** open [server/keywords.example.php](server/keywords.example.php). Copy its full contents.
2. **In Hostinger hPanel:** Files → File Manager → navigate to `public_html/` of `buildnetpro.com`.
3. **Create a new file** named `photoprep-keywords.php` and paste the contents in.
4. **Find the line** `const OPENAI_KEY = 'PASTE_YOUR_OPENAI_KEY_HERE';` and replace the placeholder with your real OpenAI key. Save.
5. **Verify:** open `https://buildnetpro.com/photoprep-keywords.php` in a browser. You should see `{"status":"ok","message":"..."}`. If you see PHP source instead, PHP isn't being executed — check hosting settings.
6. **Done.** The static site is already wired to that URL (see `KEYWORD_PROXY_URL` in [app.js](app.js)). If you ever move the file, update that one constant.

The real `photoprep-keywords.php` file (with the key) must **never** be committed to git. The `.example.php` version in this repo only has a placeholder.

## How it works

1. Enter business name, pick a niche (auto-fills a keyword pool you can edit), set your city/region.
2. Drop photos onto the upload zone (PNG / JPG / WEBP — HEIC not supported).
3. Click the map to drop a pin for your general business area.
4. Tune the geo settings:
   - **Service-area radius (km)** — the wider area photos are scattered across (sliding the slider redraws the on-map circle live).
   - **Cluster at base (%)** — what fraction of photos stay tight around the pin (shop/team/equipment shots, within 1km). The remainder spread across the full service area.
   (Timestamp spread is fixed at 100 days; JPEG quality is fixed at 0.92.)
5. **Preview** — see the proposed filenames and jittered coordinates plotted on the map.
6. **Process & Download** — generates `photo-prep-export.zip` containing all processed JPEGs ready to upload.

## Per-photo pipeline

1. Decode to canvas, downscale longest side to 2048px max (no upscaling). Small images (<720px on the shorter side) are still processed; they appear in red in the Preview list so you can spot them before exporting.
2. Encode JPEG at chosen quality; auto-drop quality until ≤ 5 MB.
3. Build fresh EXIF (GPS lat/lng jittered, `DateTimeOriginal`/`Digitized`, plausible phone Make/Model).
4. Embed EXIF with piexifjs, package in JSZip.

## Libraries (CDN only)

- [Leaflet](https://leafletjs.com/) + OpenStreetMap tiles
- [piexifjs](https://github.com/hMatoba/piexifjs)
- [JSZip](https://stuk.github.io/jszip/)
- [FileSaver.js](https://github.com/eligrey/FileSaver.js/)
