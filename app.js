/* =========================================================================
 * Photo Prep — client-side GBP photo preparation tool.
 *
 * Pure vanilla JS. CDN libs only (Leaflet, piexifjs, JSZip, FileSaver).
 * No network calls beyond map tiles + CDN. Runs fully in-browser.
 * ========================================================================= */

// --- Passphrase gate (OBSCURITY ONLY — real auth = Cloudflare Access) ---
// SHA-256 of the passphrase. Plaintext is never in source — anyone can
// still bypass the gate via DevTools (it's a client-side script), but
// the passphrase string itself won't show up in repo search / scanners.
const PASSPHRASE_HASH = "8a8c6aa1331d8f40be130e3fe8e3027c4a2cce47e08e6029c119a779cd3d3a50";

async function sha256Hex(str) {
  const buf = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- Niche keyword starter pools ---
const NICHE_KEYWORDS = {
  "Concrete":         "concrete driveway, stamped concrete, concrete patio, foundation, concrete walkway, driveway installation, concrete resurfacing, concrete repair, slab, paving, concrete contractor",
  "Car Detailing":    "car detailing, interior detailing, ceramic coating, paint correction, exterior detail, auto detailing, mobile detailing, car wash, vehicle detailing",
  "Towing":           "towing, tow truck, roadside assistance, flatbed tow, vehicle recovery, emergency towing, jump start, winch out",
  "Lawn Care":        "lawn mowing, lawn care, lawn maintenance, grass cutting, yard cleanup, fertilizing, edging, lawn service",
  "Pressure Washing": "pressure washing, power washing, driveway cleaning, house washing, soft wash, deck cleaning, exterior cleaning",
  "Window Cleaning":  "window cleaning, window washing, residential windows, commercial windows, streak-free, glass cleaning",
  "Gutter Cleaning":  "gutter cleaning, gutter clearing, downspout cleaning, gutter guards, debris removal, gutter maintenance",
  "Other":            ""
};

// Plausible phone camera Make/Model rotation
const PHONE_MODELS = [
  { make: "Apple",   model: "iPhone 14" },
  { make: "Apple",   model: "iPhone 15" },
  { make: "samsung", model: "SM-S918B"  },
  { make: "Google",  model: "Pixel 8"   }
];

const DESCRIPTORS = ["project", "job", "completed", "install", "finish", "work", "new", "local"];

// Default map center: Brantford, ON
const DEFAULT_CENTER = [43.1394, -80.2644];

// --- State ---
const state = {
  files: [],            // { file, url } for thumbnails
  pin: null,            // { lat, lng }
  map: null,
  marker: null,
  previewLayer: null,   // L.LayerGroup for jittered dots
  lastPreview: null     // [{filename, lat, lng, capture_datetime, low_res, batch}]
};

/* ============================== Gate ============================== */
const gateEl   = document.getElementById("gate");
const gateBtn  = document.getElementById("gate-btn");
const gateIn   = document.getElementById("gate-input");
const gateErr  = document.getElementById("gate-error");

async function tryUnlock() {
  const hash = await sha256Hex(gateIn.value);
  if (hash === PASSPHRASE_HASH) {
    gateEl.style.display = "none";
    initApp();
  } else {
    gateErr.hidden = false;
    gateIn.value = "";
    gateIn.focus();
  }
}
gateBtn.addEventListener("click", tryUnlock);
gateIn.addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
window.addEventListener("DOMContentLoaded", () => gateIn.focus());

/* ============================== Init ============================== */
function initApp() {
  initMap();
  wireBusinessPanel();
  wireUpload();
  wireSettings();
  wireActions();
}

/* ============================== Map ============================== */
function initMap() {
  state.map = L.map("map", { worldCopyJump: true }).setView(DEFAULT_CENTER, 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
  }).addTo(state.map);

  state.map.on("click", (e) => setPin(e.latlng.lat, e.latlng.lng));

  // Resize when becoming visible / after layout (Leaflet quirk)
  setTimeout(() => state.map.invalidateSize(), 200);
}

function setPin(lat, lng) {
  state.pin = { lat, lng };
  if (state.marker) {
    state.marker.setLatLng([lat, lng]);
  } else {
    state.marker = L.marker([lat, lng]).addTo(state.map);
  }
  document.getElementById("latlng").textContent =
    `Pin: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

/* ============================== Business panel ============================== */
function wireBusinessPanel() {
  const nicheEl = document.getElementById("biz-niche");
  const kwEl = document.getElementById("biz-keywords");
  nicheEl.addEventListener("change", () => {
    // Auto-fill keyword pool. User can edit freely.
    const pool = NICHE_KEYWORDS[nicheEl.value];
    if (pool !== undefined) kwEl.value = pool;
  });
}

/* ============================== Upload ============================== */
function wireUpload() {
  const dz = document.getElementById("drop-zone");
  const fi = document.getElementById("file-input");
  const fb = document.getElementById("file-btn");

  fb.addEventListener("click", () => fi.click());
  fi.addEventListener("change", () => addFiles(fi.files));

  ["dragenter", "dragover"].forEach(ev => {
    dz.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      dz.classList.add("dragging");
    });
  });
  ["dragleave", "drop"].forEach(ev => {
    dz.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      dz.classList.remove("dragging");
    });
  });
  dz.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });
}

function addFiles(fileList) {
  const accepted = /^image\/(png|jpe?g|webp)$/i;
  for (const f of fileList) {
    if (!accepted.test(f.type)) continue;
    state.files.push({ file: f, url: URL.createObjectURL(f) });
  }
  renderThumbs();
}

function renderThumbs() {
  const wrap = document.getElementById("thumbs");
  wrap.innerHTML = "";
  for (const item of state.files) {
    const div = document.createElement("div");
    div.className = "thumb";
    const img = document.createElement("img");
    img.src = item.url;
    img.alt = item.file.name;
    div.appendChild(img);
    wrap.appendChild(div);
  }
  document.getElementById("file-count").textContent =
    state.files.length ? `${state.files.length} file(s) selected.` : "";
}

/* ============================== Settings ============================== */
function wireSettings() {
  const jit = document.getElementById("jitter");
  jit.addEventListener("input", () => {
    document.getElementById("jitter-val").textContent = jit.value;
  });
  const q = document.getElementById("quality");
  q.addEventListener("input", () => {
    document.getElementById("quality-val").textContent = Number(q.value).toFixed(2);
  });
}

/* ============================== Actions ============================== */
function wireActions() {
  document.getElementById("preview-btn").addEventListener("click", onPreview);
  document.getElementById("process-btn").addEventListener("click", onProcess);
}

function getSettings() {
  return {
    bizName:      document.getElementById("biz-name").value.trim(),
    niche:        document.getElementById("biz-niche").value,
    city:         document.getElementById("biz-city").value.trim() || "Brantford",
    keywords:     parseKeywords(document.getElementById("biz-keywords").value),
    jitterRadius: Number(document.getElementById("jitter").value),
    spreadDays:   Number(document.getElementById("spread-days").value),
    quality:      Number(document.getElementById("quality").value),
    batches:      Math.max(1, Number(document.getElementById("batches").value) || 1)
  };
}

function parseKeywords(str) {
  return (str || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function validate(settings) {
  if (!state.pin) { alert("Drop a pin on the map first."); return false; }
  if (!state.files.length) { alert("Add some photos first."); return false; }
  if (!settings.keywords.length) {
    alert("Keyword pool is empty. Add at least one keyword.");
    return false;
  }
  return true;
}

/* ============================== Preview ============================== */
function onPreview() {
  const settings = getSettings();
  if (!validate(settings)) return;

  // Plan the batch deterministically (filenames, jittered coords, timestamps)
  // and show on the map + as a filename list.
  const plan = planBatch(settings);
  state.lastPreview = plan;

  // Map dots
  if (state.previewLayer) state.previewLayer.remove();
  state.previewLayer = L.layerGroup().addTo(state.map);
  for (const p of plan) {
    L.circleMarker([p.lat, p.lng], {
      radius: 4,
      color: "#2b6cb0",
      fillColor: "#2b6cb0",
      fillOpacity: 0.7,
      weight: 1
    }).addTo(state.previewLayer);
  }

  // Filename list
  const list = document.getElementById("preview-list");
  list.innerHTML = "";
  list.classList.add("show");
  for (const p of plan) {
    const row = document.createElement("div");
    row.className = "row" + (p.low_res ? " lowres" : "");
    row.textContent = `${p.batch ? "batch-" + p.batch + "/" : ""}${p.filename}` +
      `  •  ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}` +
      `  •  ${p.capture_datetime}` +
      (p.low_res ? "  •  LOW RES" : "");
    list.appendChild(row);
  }
}

/* ============================== Process & Download ============================== */
async function onProcess() {
  const settings = getSettings();
  if (!validate(settings)) return;

  const btn = document.getElementById("process-btn");
  const prog = document.getElementById("progress");
  btn.disabled = true;
  prog.textContent = "Preparing...";

  try {
    const plan = state.lastPreview && state.lastPreview.length === state.files.length
      ? state.lastPreview
      : planBatch(settings);

    const zip = new JSZip();
    const manifestRows = [["filename","batch","latitude","longitude","capture_datetime","low_res"]];

    for (let i = 0; i < state.files.length; i++) {
      const item = state.files[i];
      const p = plan[i];
      prog.textContent = `Processing ${i + 1}/${state.files.length}`;
      try {
        const { blob, lowRes } = await processOne(item.file, settings, p);
        p.low_res = p.low_res || lowRes;
        const path = settings.batches > 1
          ? `batch-${p.batch}/${p.filename}`
          : p.filename;
        zip.file(path, blob);
        manifestRows.push([
          p.filename,
          String(p.batch),
          p.lat.toFixed(6),
          p.lng.toFixed(6),
          p.capture_datetime,
          p.low_res ? "true" : "false"
        ]);
      } catch (err) {
        console.warn(`Skipping ${item.file.name}:`, err);
      }
    }

    // Manifest
    const csv = manifestRows
      .map(r => r.map(csvEscape).join(","))
      .join("\r\n");
    zip.file("manifest.csv", csv);

    prog.textContent = "Zipping...";
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, "photo-prep-export.zip");

    prog.textContent = `Done. ${state.files.length} file(s) packaged.`;
  } catch (err) {
    console.error(err);
    prog.textContent = "Error — see console.";
  } finally {
    btn.disabled = false;
  }
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* ============================== Plan a batch ============================== */
/**
 * Build per-photo plan: filename, jittered lat/lng, capture timestamp, batch index.
 * Filenames are uniquified across the batch.
 */
function planBatch(settings) {
  const n = state.files.length;
  const used = new Set();
  const out = [];

  // Pre-assign batches: distribute evenly across `settings.batches`
  const batchAssign = assignBatches(n, settings.batches);

  for (let i = 0; i < n; i++) {
    let filename;
    let tries = 0;
    do {
      filename = generateFilename(settings);
      tries++;
    } while (used.has(filename) && tries < 20);
    if (used.has(filename)) {
      // last-resort uniquifier
      filename = filename.replace(/\.jpg$/, "-" + randStr(2) + ".jpg");
    }
    used.add(filename);

    const { lat, lng } = jitterCoord(state.pin.lat, state.pin.lng, settings.jitterRadius);
    const ts = randomTimestamp(settings.spreadDays, batchAssign[i], settings.batches);

    out.push({
      filename,
      batch: batchAssign[i],
      lat, lng,
      capture_datetime: ts,
      low_res: false // set during processing if image is too small
    });
  }
  return out;
}

function assignBatches(n, batches) {
  const arr = new Array(n);
  for (let i = 0; i < n; i++) {
    // Group 1 gets the first chunk (most recent), group 2 next, etc.
    arr[i] = Math.min(batches, 1 + Math.floor((i * batches) / n));
  }
  return arr;
}

/* ============================== Filename generation ============================== */
function slugify(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateFilename(settings) {
  const citySlug = slugify(settings.city) || "local";
  const bizSlug  = slugify(settings.bizName);
  const kw       = pick(settings.keywords);
  const kwSlug   = slugify(kw);
  const desc     = pick(DESCRIPTORS);

  // Structure variants — keep batch non-uniform
  const variants = [
    () => `${kwSlug}-${citySlug}`,
    () => `${citySlug}-${kwSlug}`,
    () => `${kwSlug}-${desc}-${citySlug}`,
    () => `${kwSlug}`,
    () => `${desc}-${kwSlug}-${citySlug}`,
    () => `${kwSlug}-${desc}`
  ];

  // Business-name inclusion roughly 1 in 4
  let base;
  if (bizSlug && Math.random() < 0.25) {
    const bizVariants = [
      () => `${bizSlug}-${kwSlug}`,
      () => `${bizSlug}-${kwSlug}-${citySlug}`,
      () => `${kwSlug}-${bizSlug}`
    ];
    base = pick(bizVariants)();
  } else {
    // Sometimes omit the descriptor
    base = pick(variants)();
  }

  // ~30% of the time, drop trailing "-{descriptor}" if present, to vary lengths
  if (Math.random() < 0.3) {
    for (const d of DESCRIPTORS) {
      if (base.endsWith("-" + d)) { base = base.slice(0, -1 - d.length); break; }
    }
  }

  const suffix = randStr(3 + (Math.random() < 0.4 ? 1 : 0));
  return `${base}-${suffix}.jpg`.replace(/-+/g, "-");
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function randStr(len) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/* ============================== Coord jitter ============================== */
/**
 * Random offset within `radius` meters of (lat,lng).
 * Uniform inside a disc: sqrt(u) gives uniform area distribution.
 */
function jitterCoord(lat, lng, radius) {
  if (!radius) return { lat, lng };
  const u = Math.random();
  const bearing = Math.random() * 2 * Math.PI;
  const dist = Math.sqrt(u) * radius;
  const dLat = (dist * Math.cos(bearing)) / 111320;
  const latRad = (lat * Math.PI) / 180;
  const dLng = (dist * Math.sin(bearing)) / (111320 * Math.cos(latRad));
  return { lat: lat + dLat, lng: lng + dLng };
}

/* ============================== Timestamp ============================== */
/**
 * Random "YYYY:MM:DD HH:MM:SS" within the last N days, daylight 07:00–19:00.
 * For drip batches, each batch clusters in its own window:
 *   batch 1 = most recent ~N/batches days, batch 2 = the prior window, etc.
 */
function randomTimestamp(spreadDays, batchIdx, totalBatches) {
  const now = Date.now();
  const dayMs = 24 * 3600 * 1000;
  const totalSpan = spreadDays * dayMs;

  let start, end;
  if (totalBatches > 1) {
    const slice = totalSpan / totalBatches;
    end   = now - (batchIdx - 1) * slice;
    start = end - slice;
  } else {
    end = now;
    start = now - totalSpan;
  }

  const day = new Date(start + Math.random() * (end - start));
  // force daylight hours
  day.setHours(7 + Math.floor(Math.random() * 12)); // 7..18
  day.setMinutes(Math.floor(Math.random() * 60));
  day.setSeconds(Math.floor(Math.random() * 60));
  day.setMilliseconds(0);

  return formatExifDate(day);
}

function formatExifDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function exifGpsDateStamp(exifDt) {
  // "YYYY:MM:DD HH:MM:SS" -> "YYYY:MM:DD"
  return exifDt.slice(0, 10);
}
function exifGpsTimeStamp(exifDt) {
  // "YYYY:MM:DD HH:MM:SS" -> [[H,1],[M,1],[S,1]]
  const t = exifDt.slice(11);
  const [h, m, s] = t.split(":").map(Number);
  return [[h, 1], [m, 1], [s, 1]];
}

/* ============================== Per-photo pipeline ============================== */
/**
 * Steps:
 *  1. Decode to <img>, draw to canvas (downscale longest side to <=2048).
 *     Flag low_res if min(w,h) < 720 (do NOT upscale).
 *  2. Canvas -> JPEG data URL at quality. If >5MB, drop quality until <5MB.
 *  3. Build fresh EXIF: GPS (jittered), DateTimeOriginal/Digitized, Make/Model.
 *  4. piexif.insert -> Blob.
 */
async function processOne(file, settings, plan) {
  // 1. decode
  const img = await loadImage(file);
  const minDim = Math.min(img.naturalWidth, img.naturalHeight);
  const lowRes = minDim < 720;

  const MAX_SIDE = 2048;
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  let w = img.naturalWidth, h = img.naturalHeight;
  if (longest > MAX_SIDE) {
    const scale = MAX_SIDE / longest;
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  // Clear so PNG transparency becomes white (JPEG has no alpha)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  // 2. encode JPEG, down-quality if over 5MB
  const MAX_BYTES = 5 * 1024 * 1024;
  let q = settings.quality;
  let dataUrl = canvas.toDataURL("image/jpeg", q);
  let bytes = dataUrlByteSize(dataUrl);
  while (bytes > MAX_BYTES && q > 0.5) {
    q = Math.max(0.5, q - 0.05);
    dataUrl = canvas.toDataURL("image/jpeg", q);
    bytes = dataUrlByteSize(dataUrl);
  }

  // 3. fresh EXIF
  const phone = pick(PHONE_MODELS);
  const dt = plan.capture_datetime;

  const zerothIfd = {};
  zerothIfd[piexif.ImageIFD.Make]     = phone.make;
  zerothIfd[piexif.ImageIFD.Model]    = phone.model;
  zerothIfd[piexif.ImageIFD.DateTime] = dt;

  const exifIfd = {};
  exifIfd[piexif.ExifIFD.DateTimeOriginal]  = dt;
  exifIfd[piexif.ExifIFD.DateTimeDigitized] = dt;

  const lat = plan.lat;
  const lng = plan.lng;
  const gpsIfd = {};
  gpsIfd[piexif.GPSIFD.GPSLatitudeRef]  = lat >= 0 ? "N" : "S";
  gpsIfd[piexif.GPSIFD.GPSLatitude]     = piexif.GPSHelper.degToDmsRational(Math.abs(lat));
  gpsIfd[piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? "E" : "W";
  gpsIfd[piexif.GPSIFD.GPSLongitude]    = piexif.GPSHelper.degToDmsRational(Math.abs(lng));
  gpsIfd[piexif.GPSIFD.GPSDateStamp]    = exifGpsDateStamp(dt);
  gpsIfd[piexif.GPSIFD.GPSTimeStamp]    = exifGpsTimeStamp(dt);

  const exifObj = { "0th": zerothIfd, "Exif": exifIfd, "GPS": gpsIfd };
  const exifBytes = piexif.dump(exifObj);
  const withExif = piexif.insert(exifBytes, dataUrl);

  // 4. to Blob
  const blob = dataUrlToBlob(withExif);
  return { blob, lowRes };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function dataUrlByteSize(dataUrl) {
  // Estimate bytes from base64 portion length
  const i = dataUrl.indexOf(",");
  const b64 = dataUrl.slice(i + 1);
  // 4 base64 chars = 3 bytes, minus padding
  const padding = (b64.endsWith("==") ? 2 : (b64.endsWith("=") ? 1 : 0));
  return Math.floor((b64.length * 3) / 4) - padding;
}

function dataUrlToBlob(dataUrl) {
  const i = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, i);
  const b64 = dataUrl.slice(i + 1);
  const mimeMatch = /data:([^;]+);base64/.exec(meta);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const binStr = atob(b64);
  const len = binStr.length;
  const bytes = new Uint8Array(len);
  for (let j = 0; j < len; j++) bytes[j] = binStr.charCodeAt(j);
  return new Blob([bytes], { type: mime });
}
