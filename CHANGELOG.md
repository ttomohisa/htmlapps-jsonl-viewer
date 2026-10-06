# Changelog

## v1.0.1 - 2026-10-06

- Standardize local-processing badge and EN / JA header controls with localized target-language names and Help titles.
- Synchronize canonical metadata and standalone header versions at v1.0.1.
- Add header regressions for source, readable, root download, and decompressed self-extract variants; preserve data behavior and responsive visibility.

## Unreleased

- Add per-record Copy JSON in Record view, preserving the original valid line text and rejecting stale file/page actions and feedback.
- Fix top-level Record strings losing their JSON quotes and escapes, while preserving Cell Inspector string behavior.
- Add synthetic record-copy, clipboard-failure, lifecycle, and release-variant regressions with English/Japanese labels and help.

- Load the newly active file page when closing a tab, including files analyzed in the background. Preserve visited-file settings.
- Keep copy/save unavailable while a page is pending or failed; ignore stale page-read callbacks and preserve active reads when an inactive tab closes. Add source-level lifecycle and release-parity regression checks.

- Fix closing an analyzing file leaving the rest of a multi-file batch waiting indefinitely. Release cancelled worker URLs, skip closed queued files, and ignore late cancelled-worker callbacks.

## v1.0.0 - 2026-09-04

- First stable release.
- Finalize the shared Data Viewer-series UI and per-file tab state handling.
- Verify multi-file loading, invalid-file isolation, paging, Cell Inspector, CSV export, Japanese/English UI, and mobile layout.
- Finalize the Browser Kitty `#16624F` labeled-file + magnifier SVG icon and favicon.
- Refresh release documentation and Japanese/English screenshots.

## v0.1.6
- redesign the Viewer icon as a labeled file with a magnifying glass
- use Browser Kitty primary color `#16624F` for the app icon and favicon
- keep the header icon and `assets/favicon.svg` visually consistent

## v0.1.5
- update the app icon and favicon to make the file type easier to recognize
- add a viewer-style magnifier motif while keeping the Browser Kitty look

## 0.1.4

- Register supported files before analysis and keep the first newly added file active during batch loading.
- Show unsupported/gzip notices as transient messages instead of overwriting the active file status.
- Allow files to be dropped anywhere in the app after a file is already open.
- Restore file-tab activation after the batch-registration refactor so each JSONL tab switches independently.
- Align remaining Japanese byte/field/item count wording with the rest of the Viewer series.

## 0.1.3

- Scoped analysis and page-read errors to each file tab
- Prevented background file failures from replacing the active tab status

## 0.1.2 - 2026-09-03

### Fixed

- Fixed the embedded favicon data URI so the favicon is displayed correctly.
- Restored the DBF Viewer-style file tabs instead of rendering a nested default button inside each tab.
- Kept tab switching keyboard-accessible and prevented the close button from activating the tab.

## [0.1.1] - 2026-09-03

### Fixed

- Restore the template-required `schemaVersion: 1` and schema reference in `dependencies.lock.json` so `build-standalone.ps1` can run.
- Restore the schema reference in `dependencies.json` to match the current htmlapps-template format.


## [0.1.0] - 2026-09-03

### Added

- Initial JSONL / NDJSON Viewer implementation.
- Worker-based full-file line analysis with 1,000-line checkpoints.
- Invalid JSON, blank-line, UTF-8 BOM, LF, and CRLF handling.
- Field presence and type-mix summary.
- Table and Record views with paged local reads.
- Current-page CSV copy/download and valid-line JSONL copy.
- Multi-file session, Japanese/English UI, mobile bottom navigation, and fully local standalone design.
