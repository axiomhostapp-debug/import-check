# Import Check

Catch import mistakes before an export reaches your inventory or operations system.
Choose a CSV, apply a reusable rules file, and optionally compare it with yesterday's
export by stable keys. Row order does not count as a change.

## Run locally

No install, account, API key or build step is needed. Python serves static files only:

```sh
python -m http.server 8080 --bind 127.0.0.1 --directory .
```

Open `http://127.0.0.1:8080/`. Modern browsers support the native JavaScript modules.
CSV contents stay in browser memory. The app has no upload endpoint, analytics,
external libraries, fonts, remote scripts, cookies or local-storage persistence.
Closing/reloading the page discards the current session. Download rules to reuse them.
Downloaded reports can contain original cell values and filenames: review before sharing.

## Workflow

1. Select the current UTF-8 export and its delimiter (comma, semicolon or tab).
2. Enter exact key and required column names, one per line. Composite keys are supported.
3. Optionally configure column rules in the JSON editor or import a saved rules file.
4. Select a baseline export to compare additions, removals and changed values.
5. Run preflight. Fix reported physical line/column problems in the source export.
6. Export the complete JSON report. The screen shows at most 100 entries per section.

PASS means the current file satisfies the selected rules, not that an external system
will accept it. Baseline comparison has a separate result. Missing or duplicate keys
block comparison rather than guessing matches. A schema mismatch blocks comparison;
column order differences alone do not. Empty rules check CSV structure only.

## Rules

```json
{
  "version": 1,
  "key": ["sku"],
  "required": ["sku", "name", "quantity"],
  "columns": {
    "quantity": {"type": "integer", "min": 0},
    "price": {"type": "number", "min": 0},
    "status": {"type": "string", "enum": ["active", "discontinued"]},
    "updated": {"type": "date"}
  }
}
```

Supported types: string, finite number, safe integer and strict calendar date
`YYYY-MM-DD`. Numeric min/max bounds and exact string enums are supported. Optional
blank values skip type checks; add them to `required` to disallow blanks. Unknown
rule options and missing referenced columns fail closed. Keys and comparisons use
exact cell strings, preserving leading zeros, case and whitespace. Whitespace-only
keys/required fields are treated as missing. No automatic cleanup rewrites your data.

## Verification

```sh
npm test
node tests/public-data.mjs /path/to/original-public-exports
```

Unit tests use small internal cases for boundary behavior. Release checks separately
use original USDA FoodData Central and OurAirports exports sourced by an independent
research worker, not generated CSV documents. See `docs/public-data-results.json` and
the release provenance notes. Public files are not bundled into this repository.

## Limits

- UTF-8 only, maximum 20 MiB per file and 200,000 data rows. No XLSX/PDF, locale
  number parsing, currency conversion, fuzzy matching, regex rules or SQL execution.
- CSV quotes must be valid; duplicate/blank headers and ragged rows are rejected.
  Empty trailing rows are not silently discarded. Header spelling is exact.
- Parsing, validation and comparison run in a dedicated local Web Worker. Changing
  inputs or clearing the workspace terminates the active worker. Files are still
  processed entirely in memory; there is no streaming or crash recovery.
- The screen limits preview size, not total issue/report size. Large reports may
  consume substantial memory. Numeric rules use IEEE-754 numbers, not decimal money.
- No import is performed. There is no database connector, scheduled monitoring,
  cloud sync, billing, multi-user storage or guarantee of destination compatibility.
- Date rules intentionally reject mixed formats even if a source uses them validly;
  a rule failure is not proof that the publisher's data is wrong.

## Layout

`core.js` is a reusable pure-JavaScript parser/validator/diff engine. `app.js` handles
browser files, stale-result invalidation and report downloads. `index.html` and
`styles.css` provide the local interface. Core functions also run in Node.js.

## License

Provided for code review. No open-source license is granted.
