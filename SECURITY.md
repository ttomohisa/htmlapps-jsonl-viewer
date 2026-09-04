# Security Policy

JSONL Viewer is designed to process selected files locally in the browser.

## Privacy and network behavior

- Selected JSONL / NDJSON files are not uploaded by the application.
- Runtime network access is blocked by the standalone HTML CSP (`connect-src 'none'`).
- The app contains no analytics or telemetry.
- File contents are kept only for the current browser session and are not persisted by the application.

## Reporting a vulnerability

Please report security issues privately to the repository owner rather than attaching sensitive JSONL data to a public issue. If a sample file is necessary, use synthetic or redacted data.
