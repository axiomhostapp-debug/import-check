# Additional catalog QA (local only)

2026-11-18. Unchanged official Oregon Liquor and Cannabis Commission monthly catalog
exports, effective November and December 2026. This is file-format/import QA, not
shopping advice. Sources are rolling; retain the hashes to identify tested bytes.

- https://www.olcc.state.or.us/pdfs/NumericPriceListCurrentMonth.csv
  SHA256 c37b2e35a3151481a1da12ddb3a4e1ecb678eb68f9f827190001e15c753585ec
- https://www.olcc.state.or.us/pdfs/NumericPriceListNextMonth.csv
  SHA256 8ac194fc24a3910355c0cd9c20a1572a1430b0796a30344ba84fc2bf10e8650b

Key `Item Code`: 3,654 baseline rows; 3,651 current rows; 2 added, 5 removed,
3,649 changed, 0 unchanged. Every retained row has an effective-date change;
211 retained rows also change Unit Price. No missing or duplicate keys.
These outputs match the independent source worker's Python oracle. Original CSVs
contain a real quoted multiline header (`Bottles\n\nPer Case`); parser preserves it.

Actual Firefox 153 browser regression passed: file selection, diff counts, full
report download (including 211 price changes), reusable rules import/export,
input invalidation, cancellation/reset, desktop and 390px viewport, no external
requests and no page errors. Catalog comparison took about 374ms in this executor.
The test also rechecks the original USDA 88-policy-issue result.

Run `node tests/catalog-e2e.cjs /path/to/original-exports` with official Playwright
installed. `BROWSER=webkit` or `BROWSER=chromium` selects an alternate installed
engine. Those alternatives have NOT passed here.

Official WebKit 26.5 package downloaded through Playwright's official fallback
CDN. Launch requirements are missing libgtk-4, libgraphene, libharfbuzz-icu,
libmanette, libhyphen and libGLESv2. Official install-deps required an unavailable
root password and was canceled. Chromium headless-shell download previously
failed ZIP validation; installed Chromium fails the executor's singleton socket
permission. No controls were bypassed. WebKit is not the same as Safari testing.

Only local QA files changed. No public repository, CI, deployment or license
changes were made in this follow-up.

## Price-change isolation

The current UI does not filter comparison columns or suppress Effective Date.
It showed `2 added · 5 removed · 3649 changed · 0 unchanged`, followed by changed
values with key, column, before and after. Its table previews only the first 100
changed field entries; it did NOT provide a separate “211 price changes” summary.
The complete downloadable JSON retained every changed field. The browser QA
computed 211 from `comparison.changed[].fields` where column equals `Unit Price`.
Thus price changes are recoverable in the report, but isolating them currently
requires external filtering/code. No price-only feature was added or implied.

## Optional filter implementation (subsequent local milestone)

The local branch now implements an optional `compare` array in version-1 rules.
Blank UI/omitted property retains all-fields behavior. Selecting `Unit Price` on
these original exports reports 211 changed rows, 3,438 unchanged within scope,
2 added and 5 removed. Exported reports name the compared columns, and imported
saved rules restore the filter. Schema/key failures and validation are not filtered.

19 unit/worker tests pass. Actual Firefox catalog workflow passed with filter
(about 587ms), including download, filter persistence through rules re-import,
cancellation/reset and no external requests/errors. The full original default
OurAirports and USDA browser regression also passed (~2.8s airport comparison).
Core original-public-data regression remained unchanged and passed. Nothing pushed.
