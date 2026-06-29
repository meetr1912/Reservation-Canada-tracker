# Mapping all Parks Canada accommodations — research findings

**Question:** can we enumerate every Parks Canada prebuilt/roofed accommodation
(oTENTik, yurt, rustic cabin, …) nationwide — the resource IDs + park sub-area
breakdown — like `otentiks.json` does today for Atlantic oTENTiks only?

**Verdict: yes, fully — and without scraping HTML.** The booking site
(`reservation.pc.gc.ca`, a UseDirect system with a custom `/api/` layer) exposes
unauthenticated JSON discovery endpoints that return the entire catalog. Verified
by probing the live API from CI.

## Today vs. available

| | Today (`otentiks.json`) | Available via the API |
|---|---|---|
| Parks / sub-areas | 12 (Atlantic only) | **114 locations** nationwide |
| Accommodation types | oTENTik only | **30 resource categories** (9 roofed/prebuilt) |
| Locations with a roofed/prebuilt type | 12 | **53** |
| How IDs were obtained | hand-collected, one-off | enumerable programmatically |

## The discovery API (all `GET`, JSON, no auth)

Base: `https://reservation.pc.gc.ca`

| Endpoint | Returns |
|---|---|
| `/api/resourceLocation` | **114** locations (parks & sub-areas): `resourceLocationId`, `rootMapId`, GPS, timezone, `resourceCategoryIds` (which types it offers), localized full/short names |
| `/api/resourcecategory` | **30** unit *types* (the accommodation kinds) — `resourceCategoryId` → name |
| `/api/bookingcategories` | **17** booking categories (search contexts) — incl. `allowedResourceCategoryIds`, so you can map a type → its `bookingCategoryId` |
| `/api/searchcriteriatabs` | the 4 top-level groups (Frontcountry Camping, …) → child booking categories |
| `/api/resourcelocation/resources?resourceLocationId=<id>` | **every unit** at a location: `resourceId`, `resourceCategoryId`, `mapIds`, capacities, localized name. *(Proven: Banff Two Jack Lakeside = 74, Two Jack Main = 379, Village 2 = 209 units.)* |
| `/api/maps?resourceLocationId=<id>` / `/api/maps/root` | the map tree (`mapLinks → childMapId`, `mapResources`) — gives the visual sub-area breakdown |
| `/api/availability/map?mapId=…&bookingCategoryId=…&startDate=…&endDate=…&getDailyAvailability=true` | bulk availability for a whole map: `resourceAvailabilities` (resourceId → per-day) + `mapLinkAvailabilities` (child maps) |
| `/api/availability/resourcedailyavailability?resourceId=…&bookingCategoryId=…&…` | per-resource daily availability (**what the current scraper uses**) |

## Accommodation type catalog (`/api/resourcecategory`)

Roofed / prebuilt (what this project would add). `resourceType=0` = bookable site:

| resourceCategoryId | Type |
|---|---|
| `-2147483643` | **oTENTik** (current) |
| `-2147483647` | **Yurt** |
| `-2147483646` | **Cabin** |
| `-2147483645` | **Rustic Cabin** |
| `-2147483644` | **Ôasis** |
| `-2147483642` | **MicrOcube** |
| `-2147483635` | **Equipped Camping** |
| `-2147483631` | **Teepee** |
| `-2147483630` | **Prospector Tent** |
| `-2147483634` / `-2147483633` | Backcountry Cabin / Backcountry Yurt (`resourceType=3`) |

Other categories returned: Campsite, Campsite/Seasonal, Overflow, Group, and
non-lodging activities (Parking, Shuttle, Ferry, Day Use Bus, Fishing, Guided
Event, Hiking/Backpacking trips, …) which we'd ignore.

**53 locations offer a roofed/prebuilt type**, e.g. Banff (Two Jack Lakeside,
Village 2), Jasper – Whistlers, Kootenay – Redstreak, Pacific Rim – Green Point,
Elk Island, Forillon (oTENTik + MicrOcube), Fundy (Yurt + oTENTik; Backcountry
Rustic Cabin), Grasslands, Prince Albert, Point Pelee, Fort Langley, Fort Rodd
Hill, Mount Revelstoke (MicrOcube), … — coast to coast.

## Recipe to build a national `resources.json`

```
GET /api/resourcecategory                      # id -> type name (filter to roofed set)
GET /api/bookingcategories                      # resourceCategoryId -> bookingCategoryId
GET /api/resourceLocation                       # 114 parks (id, name, region, rootMapId)
for each location:
    GET /api/resourcelocation/resources?resourceLocationId=<id>
        -> for each unit: keep {resourceId, resourceCategoryId, name, mapIds}
           where resourceCategoryId in <roofed set>
emit records: {Park, SubArea, Type, ResourceName, resourceId, bookingCategoryId}
```

That replaces/extends `otentiks.json` with every roofed unit in the country, and
gives the park → sub-area → type → unit breakdown for the UI.

## Availability at scale

- **Roofed-only (recommended first step):** ~53 locations, on the order of a few
  hundred units. The existing per-resource scan (`resourcedailyavailability`,
  paced ~0.6 s) scales fine (a few minutes).
- **Everything incl. campsites:** thousands of units (Banff Main alone = 379).
  Per-resource would be too slow/abusive — switch to **`/api/availability/map`**
  (one call returns a whole map's `resourceAvailabilities`), walking the map tree.
- Keep the existing safeguards (pacing, 403 backoff, "don't overwrite on mass
  failure"). The map-level endpoint is the efficient path for nationwide scale.

## Suggested changes to support it

1. **Data model:** add `ResourceCategory`/`Type` + split `Park`/`SubArea` to each
   record; build `resources.json` from the recipe (commit a `discover.py`).
2. **Scraper:** iterate the roofed set; derive `bookingCategoryId` per type from
   `bookingcategories.allowedResourceCategoryIds`; (optionally) move to
   `/api/availability/map` for efficiency.
3. **UI:** add a **type filter** (oTENTik / Yurt / Cabin / …) and a region/park
   filter; the report schema already carries park + name, just add `type`.

## Risks / caveats

- Internal API (no SLA): field names/IDs can change; pin nothing we can re-derive.
- IDs are stable negative ints but should be re-enumerated periodically (a weekly
  `discover.py` run keeps `resources.json` fresh as PC adds sites).
- Be polite: pace requests, cache the catalog, prefer map-level availability at
  scale. Public data only; no auth or PII involved.

_Findings verified via a CI probe against the live API (June 2026)._
