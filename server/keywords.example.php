<?php
declare(strict_types=1);

/* ============================================================================
 * Photo Prep — server-side OpenAI keyword proxy.
 *
 * Lives on Hostinger. Called by the static site at
 *   https://trianglecityinc.github.io/gmb-image-geotagger/
 * to generate niche-specific keyword pools without exposing the OpenAI key
 * to the browser. PHP runs server-side — visitors only see this script's
 * OUTPUT, never its SOURCE.
 *
 * Deploy procedure (do this once, never again):
 *   1. Open hPanel -> Files -> File Manager.
 *   2. Navigate to public_html/ of buildnetpro.com.
 *   3. Upload this file, then RENAME it to "photoprep-keywords.php"
 *      (drop the ".example" part).
 *   4. Right-click the file -> Edit. Replace PASTE_YOUR_OPENAI_KEY_HERE
 *      with your real OpenAI key. Save.
 *   5. Done. Final URL: https://buildnetpro.com/photoprep-keywords.php
 *
 * Security notes:
 *   - This .example.php file in the repo is safe to commit (placeholder only).
 *   - The renamed photoprep-keywords.php on Hostinger contains the real key
 *     and MUST NOT be committed to git anywhere.
 *   - CORS only accepts requests from the GitHub Pages site (and localhost
 *     for local testing). Anyone hitting this URL from a different origin
 *     gets 403 back.
 * ============================================================================ */

// === REPLACE WITH YOUR REAL OPENAI KEY (only on Hostinger, NOT in git) ===
const OPENAI_KEY = 'PASTE_YOUR_OPENAI_KEY_HERE';
// =========================================================================

const ALLOWED_ORIGINS = [
    'https://trianglecityinc.github.io',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
];

const SYSTEM_PROMPT = 'You generate SEO keyword pools for local service business image filenames. '
                    . 'Given a niche, return 12 short, comma-separated, lowercase keyword phrases '
                    . '(1-3 words each) that would naturally appear in image filenames a local '
                    . "customer might search for. Include the niche's specific services, common "
                    . 'tools, materials, and natural variations a real business would actually use. '
                    . 'No numbers, no quotes, no markdown, no explanations. Just the comma-separated list.';

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$origin_allowed = in_array($origin, ALLOWED_ORIGINS, true);

if ($origin_allowed) {
    header("Access-Control-Allow-Origin: $origin");
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Max-Age: 86400');
header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'] ?? '';

// CORS preflight
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Health check (browse the URL to confirm deploy worked)
if ($method === 'GET') {
    http_response_code(200);
    echo json_encode([
        'status'  => 'ok',
        'message' => 'Photo Prep keyword proxy is live. POST { "niche": "..." } to use.',
    ]);
    exit;
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

if (!$origin_allowed) {
    http_response_code(403);
    echo json_encode(['error' => 'forbidden origin', 'origin' => $origin]);
    exit;
}

if (OPENAI_KEY === '' || OPENAI_KEY === 'PASTE_YOUR_OPENAI_KEY_HERE') {
    http_response_code(500);
    echo json_encode(['error' => 'OpenAI key not configured on server']);
    exit;
}

$raw  = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
$niche = is_array($body) ? trim((string)($body['niche'] ?? '')) : '';

if ($niche === '' || mb_strlen($niche) > 80) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid niche']);
    exit;
}

$payload = json_encode([
    'model'    => 'gpt-4o-mini',
    'messages' => [
        ['role' => 'system', 'content' => SYSTEM_PROMPT],
        ['role' => 'user',   'content' => "Niche: $niche"],
    ],
    'temperature' => 0.5,
    'max_tokens'  => 250,
]);

$ch = curl_init('https://api.openai.com/v1/chat/completions');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . OPENAI_KEY,
    ],
    CURLOPT_TIMEOUT => 30,
]);
$response = curl_exec($ch);
if ($response === false) {
    $err = curl_error($ch);
    curl_close($ch);
    http_response_code(502);
    echo json_encode(['error' => 'upstream curl error', 'detail' => $err]);
    exit;
}
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE) ?: 502;
curl_close($ch);

$data = json_decode($response, true);
if (!is_array($data)) {
    http_response_code(502);
    echo json_encode(['error' => 'invalid upstream response']);
    exit;
}
if (isset($data['error'])) {
    http_response_code($status);
    echo json_encode(['error' => 'openai error', 'detail' => $data['error']]);
    exit;
}

$content = (string)($data['choices'][0]['message']['content'] ?? '');
$content = preg_replace('/^\s*\d+\s*[).\-]\s*/m', '', $content);
$content = str_replace(['"', "'", "\u{201C}", "\u{201D}", "\u{2018}", "\u{2019}"], '', $content);
$content = preg_replace('/\r?\n+/', ', ', $content);
$parts   = array_values(array_filter(array_map('trim', explode(',', $content))));
$keywords = implode(', ', $parts);

http_response_code(200);
echo json_encode(['keywords' => $keywords]);
