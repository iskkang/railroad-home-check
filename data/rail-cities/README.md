# City train-activity data (`/trains/`)

Aggregates behind `/trains/` and `/trains/<city>/`. Pages are static and rebuilt with:

```
node scripts/build-rail-cities.mjs && npm run check:seo
```

## Files

- `cities.json` — city slugs, FRA inventory city codes, display names, fetch date and filters.
- `summary.json` — per-city totals over open (`crossingclosed = 'No'`), at-grade (`crossingpositioncode = '1'`), public (`crossingtypecode = '3'`) crossings in the FRA Form 71 current dataset (`m2f8-22s6`), matched on `citycode` (records reported as in or near the city). `top` rows: `[crossingId, street, railroad, dayThru, nightThru, passengerPerDay, maxTimetableSpeed, whistleBanCode, countYear, incidents2021to2026]`.
- `mainline.json` — the same crossings excluding transit/commuter agencies and crossings with transit trains (`f*` fields). `fTop` rows: `[crossingId, street, railroad, dayThru, nightThru, maxTimetableSpeed, whistleBanCode, countYear]`.

Incidents are counts of FRA Form 57 reports (`uwah-u9bn`, 2021-01-01 to 2026-08-31) by `gradecrossingid`.

## Refreshing

data.transportation.gov is not reachable from every build environment. The 2026-11-09 snapshot was queried from a browser with the Socrata API using the filters above; re-run the same queries, overwrite the JSON files, update `fetchedOn`, then rebuild. Do not hand-edit numbers.
