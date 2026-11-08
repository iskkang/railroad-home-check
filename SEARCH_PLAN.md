# Organic search validation

Production origin: https://railroad-home-check.vercel.app

## Implemented on 2026-11-08

- Public guide pages explain distinct tasks: address sound-source checks, nearby road counts, NYC complaint records and comparing shortlisted homes.
- Three core railroad guides include concrete lookup steps, interpretation pitfalls, public-source references and related checks.
- All sitemap pages are reachable from the homepage. Guides have early and final address-check links.
- `guide_checker_click` measures use of those links, with only a static public guide path. Existing `property_check_started`, `property_check_completed` and `property_check_failed` remain unchanged. No address, coordinates, query string or referrer is added to events.
- Source limitations and an independent about/corrections page are visible. No fabricated reviews, rankings, property-level noise values or city pages were introduced.
- `npm run check:seo` checks sitemap URL uniqueness, canonical URLs, H1s, unique titles/descriptions, JSON-LD syntax, local links and graph reachability.

## Search query hypotheses (not measured volumes or achieved rankings)

| Query intent | Primary page |
| --- | --- |
| noise sources near an address | /noise-near-an-address/ |
| road traffic counts near an address | /road-traffic-by-address/ |
| NYC noise complaints near an address | /nyc-noise-complaints-by-address/ |
| how many trains pass near my house | /how-many-trains-pass-near-my-house/ |
| railroad quiet zone near a home | /quiet-zone-homebuyer-guide/ |
| compare homes near roads and rail | /compare-homes-road-and-rail/ |

## Live-source verification limit

A NYC noise-layer request through production returned HTTP 502 on 2026-11-08. The same query through the local handler successfully returned 200 records from the original source. The production-source issue remains unresolved; the error UI now links to the official dataset, and the guide explains that an error is not zero complaints. No claim is made that this fallback repairs the API.

## Pending authenticated owner setup

Search Console access is not available through the connected tools. Actual query impressions, clicks, rank and Google indexing have not been verified.

1. In Google Search Console, add/select the URL-prefix property `https://railroad-home-check.vercel.app/`.
2. Verify ownership using a supported owner method. Existing GA4 code does not by itself prove verification or account access.
3. Submit `https://railroad-home-check.vercel.app/sitemap.xml`.
4. Inspect the homepage, guide hub and the focused search pages; check Google's selected canonical and rendered page. Request indexing for important new pages where appropriate.
5. Use Search Console Performance and Page indexing reports to decide the next change. Do not infer indexing from a `site:` query alone.

## Decision sequence

- If important pages are not indexed, investigate indexing reasons before creating more pages.
- If pages gain relevant impressions but few clicks, revise the title and the answer presented to that query.
- If visitors read guides but do not click into the checker, improve task fit and the call to action.
- If checks start but fail, resolve API/matching failures before pursuing more traffic.
- If the same useful query pattern performs across several pages, extend that specific topic with additional evidence.

No traffic, ranking, ad revenue or indexing timing is guaranteed. No paid promotion or recurring monitoring job was enabled by this change.
