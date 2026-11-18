# Release verification

Local candidate tested on Node 24 and official Playwright Firefox 153.

Passed:
- 16 core and worker integration tests.
- Genuine original USDA and OurAirports release checks against independent counts.
- Actual Firefox file selection, 86,371-row current airport export against baseline:
  17 added, 1 removed, 114 changed, 86,240 unchanged (about 3 seconds here).
- Full JSON report download, saved rules download and re-import.
- Editing rules invalidates prior results; Clear workspace during processing cancels
  work, clears file selections, and prevents stale output. Regression test retained.
- USDA rule check shows 88 real policy failures, not a fabricated all-pass result.
- Desktop (1280 px) and narrow (390 px) rendering checked; no page overflow.
- Browser request observation found no external requests; no page JavaScript errors.
- Fresh ZIP extraction passes tests and serves all required static files.

GUI testing caught and fixed a button ID shadowing form.reset(). The reproducible
`tests/e2e.cjs` uses original online exports, not generated CSV fixtures.

Remaining limitations: Chromium/Safari not verified. The installed Chromium is
blocked by its executor socket restriction; the official headless-shell download
failed archive validation. Firefox used its official distribution without disabled
browser protections. Remote CI has not run; no repository has been published.
This is a bounded local tool, not proof of compatibility with every browser or CSV.

Run UI regression after installing official `playwright@1.62.1` and its Firefox:
`node tests/e2e.cjs /path/to/original-public-exports`.
