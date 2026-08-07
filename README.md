# Railroad Home Check — validation MVP

A deliberately small validation product for U.S. home buyers. Enter an address and it translates Federal Railroad Administration grade-crossing records into buyer-oriented questions:

- nearest reported grade crossing
- straight-line distance to crossing
- reported day/night thru-train movements
- FRA quiet-zone status
- train-count year
- typical / maximum timetable speeds when available
- recent six-year crossing incident count when available

## Why this MVP is intentionally narrow

This project is for **organic-demand validation**, not a full railroad intelligence platform. Do not add accounts, billing, AI chat, maps, appraisal estimates, or noise-dB predictions before the demand test succeeds.

## Data sources

1. **FRA Grade Crossing Inventory / FRAGradeX ArcGIS service**
   - Crossing records reported by railroads and state agencies.
   - Key fields include `DAYTHRU`, `NGHTTHRU`, `WHISTBAN`, train-count year and speed fields.
2. **FRA Form 57 six-year incident view on Data.Transportation.gov**
   - Used only to count recent reported incidents by crossing ID.
3. **U.S. Census Geocoder**
   - Converts the user-entered U.S. street address to approximate coordinates.

## Important interpretation rules

- `DAYTHRU` / `NGHTTHRU` are **reported estimated movements**, not live schedules.
- The property-to-crossing distance is straight-line distance to a grade crossing, **not distance to the rail track itself**.
- Quiet zones restrict routine horn sounding at covered public crossings, but do not guarantee silence.
- Never present the generated attention level as a safety rating, appraisal, noise measurement, or guarantee.

## Deploy to Vercel

No domain is needed.

1. Create an empty GitHub repository only after you are ready to deploy, or upload this folder directly through your preferred workflow.
2. Import it into Vercel.
3. Framework preset: **Other**.
4. No build command is required.
5. No environment variables are required for the validation MVP.

Vercel serves `index.html` as the static page and `/api/*.js` as Node serverless functions.

## First QA test

Try several U.S. full street addresses in rail-heavy metros (Fort Worth, Houston, Chicago suburbs, Kansas City, etc.). For each result, compare the nearest crossing against the official FRA crossing inventory before publishing widely.

## Validation rule

Do not spend on Google Ads. Create 30–50 genuinely useful SEO pages only after live API QA.

Suggested kill rule after 6–8 weeks with ~50 indexed pages:

- **Kill:** fewer than roughly 1,000–2,000 Search Console impressions and no meaningful long-tail discovery.
- **Investigate:** 2,000–5,000 impressions with rising weekly trend.
- **Continue:** 5,000+ impressions, rising queries, and organic users actually submitting addresses.

The thresholds are internal experiment rules, not industry benchmarks.
