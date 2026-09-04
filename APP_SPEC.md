# APP_SPEC.md — JSONL Viewer

## 1. Product identity

- **Name:** JSONL Viewer
- **Version:** v1.0.0
- **Purpose:** Open local JSONL / NDJSON files, inspect records, detect invalid lines, and review top-level field presence and type consistency without uploading the file.
- **Primary users:** Developers, data engineers, AI/LLM practitioners, and anyone receiving line-delimited JSON logs or datasets.
- **Release artifact:** `dist/index.html`

## 2. Successful user flow

1. Select or drop one or more `.jsonl`, `.ndjson`, `.jsonl.txt`, or `.ndjson.txt` files.
2. The browser scans the file line by line and reports total, valid, and review-needed lines.
3. Review detected top-level fields, presence rates, and mixed types.
4. Inspect the current page as a table or record list without holding all parsed records in memory.
5. Jump from an issue entry to the affected line.
6. Copy valid records from the current page as JSONL, or copy/save the current page as CSV.

## 3. Functional requirements

- Multiple files in one session with tabs on desktop and a compact selector on narrow screens.
- Register supported files as separate tabs before analysis, so one failed file does not stop the remaining files from opening.
- Keep status, errors, overview, fields, issues, and data scoped to each file tab; switching tabs must never show stale state from another file.
- Allow additional JSONL / NDJSON drag and drop while files are already open.
- UTF-8 JSON Lines / NDJSON parsing. UTF-8 BOM is tolerated on the first line and reported in file information.
- LF and CRLF line endings.
- Empty lines are flagged as review-needed instead of stopping the whole file.
- Malformed JSON lines are flagged while valid lines remain available.
- Full-file analysis runs in a Blob Worker to avoid blocking the UI.
- Analysis stores checkpoints every 1,000 lines instead of retaining every parsed record.
- Page reads use the nearest checkpoint and `File.slice()` so the app only parses the requested page plus a small lead-in.
- Page sizes: 50 / 100 / 250 / 500 / 1,000.
- Direct page jump.
- Table view with current-page sort and column visibility.
- Record view with collapsible pretty-printed JSON.
- Cell inspector for full strings, objects, arrays, numbers, booleans, and null.
- Top-level field statistics: presence count/rate and observed JSON types.
- Mixed types are explicitly marked.
- Non-object top-level values are represented under `__value` so they do not collide with a normal object field named `value`.
- Field statistics are capped at 500 distinct fields to protect UI/memory; the app indicates when the cap is reached.
- Issue details retained for the first 1,000 issues; the overview renders the first 50 and reports the total issue count.
- Current-page JSONL copy includes only valid JSON lines.
- Current-page CSV includes `__line`, `__status`, `__raw`, and selected fields.
- User-editable CSV output filename.
- Japanese and English UI.

## 4. Privacy and network

- Files are read only inside the browser.
- No file data is uploaded or persisted by the app.
- No analytics, telemetry, external API, CDN, or runtime network dependency.
- CSP keeps `connect-src 'none'`.
- Blob Worker is allowed because analysis runs locally from code embedded in the same standalone HTML.

## 5. Non-goals for v1.0.0

- Editing or repairing JSONL in place.
- Saving a repaired full file.
- JSONPath / jq-style query execution.
- Full-file sorting or filtering.
- gzip-compressed `.jsonl.gz` / `.ndjson.gz` input.
- Schema validation against JSON Schema.
- Deep schema inference for nested object paths.

## 6. UX

- Keep the same Data Viewer-series layout established by DBF Viewer.
- Empty state clearly asks for a JSONL / NDJSON file.
- Overview shows file size, total lines, valid lines, and review-needed lines.
- On smartphones, Overview / Fields / Data are separate bottom-tab pages to avoid a long stacked screen.
- The data table scrolls inside its container; the page itself must not horizontally overflow at 320px.
- Technical parser messages are secondary detail; the primary UI says that a line cannot be parsed as JSON.
- Problem lines never make valid lines unavailable.

## 7. Performance expectations

- A large file is scanned in 1 MiB chunks in a worker.
- Parsed record objects are not retained for the entire file.
- Checkpoint memory grows approximately with line count / 1,000 rather than line count.
- Only the current page is materialized as parsed JavaScript values.
- At most 500 field summaries and 1,000 issue details are retained.

## 8. Browser target

Current stable Chromium, Firefox, and Safari where File API, Blob Worker, TextDecoder, and modern JavaScript are available. Direct `file://` opening is a distribution requirement.

## 9. Acceptance criteria

- Valid UTF-8 JSONL loads and displays.
- `.ndjson` loads identically.
- Invalid JSON and blank lines are counted and navigable without failing the file.
- UTF-8 BOM + CRLF is accepted.
- Mixed types appear in Fields.
- Primitive/array top-level values appear under `__value`.
- Table / Record switching works.
- 50 / 100 / 250 / 500 / 1,000 row paging works.
- Current-page CSV and valid-line JSONL copy work.
- Multiple files, Japanese/English, help, dialogs, mobile tabs, and CSP remain functional.
