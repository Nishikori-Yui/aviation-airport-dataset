# Aviation Airport Dataset

This repository builds and publishes an airport station dataset derived from OpenStreetMap (ODbL), with optional enrichment from OurAirports (public domain). It outputs a JSON file intended for consumers like `aviation-wx-decoder`.

## Output

Release asset: `airports.json`

Expected schema (trimmed):

```json
{
  "meta": {
    "dataset_version": "2026-02-01",
    "generated_at": "2026-02-01T12:00:00Z",
    "sources": ["OpenStreetMap contributors", "OurAirports (public domain)"]
  },
  "airports": {
    "ZBAA": {
      "icao": "ZBAA",
      "iata": "PEK",
      "name": "北京首都国际机场",
      "name_en": "Beijing Capital International Airport",
      "name_zh": "北京首都国际机场",
      "name_zh_hans": "北京首都国际机场",
      "name_local": "北京首都国际机场",
      "local_lang": "zh",
      "country": "CN",
      "city": "Beijing",
      "lat": 40.0801,
      "lon": 116.5846
    }
  }
}
```

## Build workflow

- Fetch OSM data for `aeroway=aerodrome`.
- Load OurAirports CSV to fill missing `country`, `city`, `iata`, and `name_en` when OSM tags are incomplete.
- Extract `icao`, `iata`, `name`, `name:en`, and `name:<local>`.
- Infer `name_local` using a country-to-language map.
- Emit `airports.json` with metadata.
- Publish as a GitHub Release asset.

## Local build

PowerShell:

```bash
powershell -ExecutionPolicy Bypass -File scripts/build.ps1 -Version 2026-02-03
```

Bash:

```bash
bash scripts/build.sh 2026-02-03
```

Environment variables:

- `OVERPASS_URL` (default: `https://overpass-api.de/api/interpreter`)
- `OVERPASS_URLS` (comma-separated fallback list)
- `OVERPASS_RETRIES` (default: `3`)
- `OVERPASS_RETRY_BASE_MS` (default: `1500`)
- `OURAIRPORTS_URL` (default: `https://ourairports.com/data/airports.csv`)
- `DATASET_VERSION` (optional)

## License & attribution

- Code: MIT (see `LICENSE`).
- Data: OpenStreetMap contributors (ODbL) and OurAirports (public domain). See `DATA_LICENSE.md`.

Any redistribution must provide attribution and access to the derived dataset.
