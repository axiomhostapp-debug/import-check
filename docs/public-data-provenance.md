# Genuine release QA inputs
Retrieved 2026-11-18. No CSV bytes revised, generated, or filtered. Local filenames differ for distinct snapshots. Sources and expected results independently measured with Python's csv.DictReader, UTF-8 with optional BOM, exact value comparison by key.

- USDA ARS FoodData Central Foundation Foods, https://fdc.nal.usda.gov/download-datasets/. CC0 per https://fdc.nal.usda.gov/api-guide/. Archive URLs: https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2024-10-31.zip and https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2025-04-24.zip. Extracted original archive members food.csv and food_nutrient.csv. Food key fdc_id: 68,875→74,175; 5,300 added; 0 changed or removed. Nutrient key id: 149,615→155,243; 5,628 added; 0 changed or removed. Neither has missing or duplicate IDs when keyed correctly. Wrong key fdc_id in 2025 nutrient file has 7,233 duplicate groups; 92,297 excess rows. Both pairs have equal headers. USDA reference observations, not retail inventory levels.
- OurAirports airport directory nightly dumps, https://ourairports.com/data/, public domain per publisher. Stable key id, documented https://ourairports.com/help/data-dictionary.html. Source URLs https://raw.githubusercontent.com/davidmegginson/ourairports-data/2572ad98ddf81da25b61f91a9e2188d01017c6ea/airports.csv and https://raw.githubusercontent.com/davidmegginson/ourairports-data/13c732d99cd8a0147f3a42533bff671bcb8000cf/airports.csv. 86,355→86,371; 17 added, 1 removed, 114 changed, 86,240 unchanged. No duplicate/missing ids, no header changes. Nov 18: 77,318 blank iata_code, 14,978 blank elevation_ft, zero blank name. Directory data, not member profile/comment exports.

Checksums in SHA256SUMS cover both downloaded USDA archives and the six pristine CSVs.

## Reproduce

Download the two USDA ZIPs above, extract the original `food.csv` and
`food_nutrient.csv` members and rename them with their release-date prefixes
(`2024-10-31-food.csv`, `2025-04-24-food.csv`, and similarly for nutrients).
Save the two immutable OurAirports URLs as `airports-2026-11-13.csv` and
`airports-2026-11-18.csv`, respectively. Keep bytes unchanged. Check the
provided SHA256 sums before running `node tests/public-data.mjs DIRECTORY`.
The test does not fetch documents or substitute generated examples.
