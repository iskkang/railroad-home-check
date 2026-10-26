# TMAS historical hourly sample

This release is a December 2023 snapshot, not a live or annual traffic estimate.
It is not automatically updated. 6,783 stations have matched official coordinates
and at least 14 complete daily records in one direction/lane stream.

## Sources

- https://www.fhwa.dot.gov/policyinformation/tables/tmasdata/2023/2023_station_data.zip
- https://www.fhwa.dot.gov/policyinformation/tables/tmasdata/2023/dec_2023_ccs_data.zip
- https://services.arcgis.com/xOi1kZaI0eWDREZv/ArcGIS/rest/services/NTAD_Travel_Monitoring_Analysis_System_Stations/FeatureServer/0

Source files were retrieved on 2026-10-26. Coordinate service was paginated with
OBJECTID order until exceededTransferLimit was false. Save its feature array to
stations.json beside the build script, together with both unmodified source ZIPs.
Run python build_tmas.py, then copy output/data/tmas into the site data/tmas folder.
Do not commit the raw nationwide ZIPs.

## Method

Join state abbreviation plus station ID, preserving alphanumeric IDs and padding
numeric IDs to six characters. Use the official station geometry coordinates.
Use only unrestricted records with all 24 nonnegative integer hourly counts.
Drop conflicting duplicate stream/date records. Missing hours and dates are never
zero-filled. Pick one stream per station: most valid dates, then lane code 0,
then direction/lane code order. Never sum across direction/lane streams.
Weekdays and weekends are derived from calendar dates, not source weekday codes.
Each chart averages the selected complete dates, independently for each hour.
Night volume sums mean hours 22,23,00–05 from calendar-day records, not matched
consecutive overnight intervals. Rounded hourly values have 0.1 vehicle precision.
December holidays and seasonality limit representativeness. Source time-zone and
DST conventions are not independently verified. No truck or noise inference.

The UI lists up to three stations within 10 miles. Proximity is not proof of
same-road connectivity. All profiles are labeled reference station patterns.
User must verify the reported road/location before using a pattern for a home.
