# Exact multiline headers: verification

Base: public main d60f1648929ac6206e09b5e8e3132e76335562fc. November 19, 2026.

The original OLCC monthly exports documented in `catalog-followup-qa.md` contain
the exact header `Bottles\n\nPer Case`. The former UI split it into separate names
and rejected it in imported comparison rules, although the CSV engine preserved it.

The change adds an optional parsed-header picker for key, required, and comparison
fields. Existing manual single-line entry remains available. Multiline selection or
import switches name editing to JSON arrays, retaining every character. Switching
back refuses a lossy conversion. The picker runs in a separate cancellable worker;
its success checks only headers, not the body. Full validation still requires Run.

Unchanged official sources (rolling URLs; use these hashes for reproducibility):
- https://www.olcc.state.or.us/pdfs/NumericPriceListCurrentMonth.csv
  c37b2e35a3151481a1da12ddb3a4e1ecb678eb68f9f827190001e15c753585ec
- https://www.olcc.state.or.us/pdfs/NumericPriceListNextMonth.csv
  8ac194fc24a3910355c0cd9c20a1572a1430b0796a30344ba84fc2bf10e8650b

Key `Item Code`, comparison `Bottles\n\nPer Case`: 3 changed, 3,646 unchanged,
2 added, 5 removed. Case-pack changes: 2364B and 4653B from 6 to 12;
11441B from 12 to 6. Source files are not bundled.

Reproduce with official Playwright and Firefox installed:

```
npm test
node tests/public-data.mjs /path/to/original-exports
node tests/e2e.cjs /path/to/original-exports
node tests/catalog-e2e.cjs /path/to/original-exports
node tests/multiline-e2e.cjs /path/to/original-exports
```

The new browser test verifies source hashes, exact selection for all three rule
fields, duplicate selection, refusing lossy editing, original changes in downloaded
reports, saved rules round-trip without files, file replacement and reset, desktop
and narrow viewport layout, and no external requests or page errors. Internal unit
fixtures test parser edge cases; they do not substitute for these publisher files.

Chromium and Safari are not verified. Installed Chromium fails the executor's
ProcessSingleton socket permission. Firefox is the tested engine; no claim of
universal browser or CSV compatibility is made. The picker decodes the selected
file in its worker (up to the existing 20 MiB limit) to identify the header; it is
not a streaming preview. Replacing a file does not silently drop saved rules;
missing referenced columns still fail when preflight runs.

Verified on Node 24 and Firefox 153: all 22 unit/worker tests, all three browser
regressions above, and the public-data core regression passed. Screenshots at
1280px and 390px were inspected; controls and labels remain readable without
page overflow. Independent Python CSV analysis confirmed the three exact changes.
No remote CI run is claimed for this local milestone.
