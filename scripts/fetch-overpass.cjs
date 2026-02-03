#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_OVERPASS = 'https://overpass-api.de/api/interpreter';
const DEFAULT_OVERPASS_FALLBACKS = [
  DEFAULT_OVERPASS,
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
];
const DEFAULT_OURAIRPORTS = 'https://ourairports.com/data/airports.csv';

let opencc = null;
try {
  // Optional dependency: enables Traditional -> Simplified conversion.
  opencc = require('opencc-js');
} catch (err) {
  opencc = null;
}

function parseArgs(argv) {
  const args = {
    out: null,
    version: null,
    overpass: process.env.OVERPASS_URL || DEFAULT_OVERPASS,
    overpassList: process.env.OVERPASS_URLS || '',
    ourairports: process.env.OURAIRPORTS_URL || DEFAULT_OURAIRPORTS,
    cache: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      args.out = argv[++i];
      continue;
    }
    if (arg === '--version') {
      args.version = argv[++i];
      continue;
    }
    if (arg === '--overpass') {
      args.overpass = argv[++i];
      continue;
    }
    if (arg === '--overpass-list') {
      args.overpassList = argv[++i];
      continue;
    }
    if (arg === '--ourairports') {
      args.ourairports = argv[++i];
      continue;
    }
    if (arg === '--cache') {
      args.cache = argv[++i];
      continue;
    }
  }
  return args;
}

function loadCountryLangMap() {
  const mapPath = path.join(__dirname, '..', 'data', 'country_lang_map.json');
  if (!fs.existsSync(mapPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(mapPath, 'utf8'));
}

function normalizeCountry(code) {
  if (!code) {
    return null;
  }
  const trimmed = String(code).trim().toUpperCase();
  if (trimmed.length === 2) {
    return trimmed;
  }
  return null;
}

function pickCountry(tags) {
  return (
    normalizeCountry(tags['addr:country']) ||
    normalizeCountry(tags['country']) ||
    normalizeCountry(tags['country_code']) ||
    normalizeCountry(tags['is_in:country_code']) ||
    normalizeCountry(tags['ISO3166-1:alpha2']) ||
    null
  );
}

function pickCity(tags) {
  return tags['addr:city'] || tags['is_in:city'] || tags['city'] || null;
}

function pickLocalName(tags, countryLangMap, countryCode) {
  const lang = countryCode ? countryLangMap[countryCode] : null;
  if (!lang) {
    return { name_local: tags.name || null, local_lang: null };
  }
  const localName = tags[`name:${lang}`] || tags.name || null;
  if (tags[`name:${lang}`]) {
    return { name_local: localName, local_lang: lang };
  }
  if (tags.name) {
    return { name_local: localName, local_lang: lang };
  }
  return { name_local: localName, local_lang: null };
}

function pickChineseName(tags, countryCode) {
  const zh =
    tags['name:zh-CN'] ||
    tags['name:zh-Hans'] ||
    tags['name:zh'] ||
    tags['name:zh-Hant'] ||
    null;
  if (zh) {
    return zh;
  }
  if (countryCode && ['CN', 'TW', 'HK', 'MO'].includes(countryCode)) {
    return tags.name || null;
  }
  return null;
}

function toSimplifiedZh(value) {
  if (!value || !opencc) {
    return null;
  }
  const converter = opencc.Converter({ from: 'tw', to: 'cn' });
  return converter(value);
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      result.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  result.push(current);
  return result;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }
  const header = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const row = {};
    header.forEach((key, idx) => {
      row[key] = cols[idx] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

async function loadOurAirports(ourairportsUrl, cachePath) {
  if (cachePath && fs.existsSync(cachePath)) {
    const cached = fs.readFileSync(cachePath, 'utf8');
    return parseCsv(cached);
  }
  const response = await fetch(ourairportsUrl);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OurAirports error ${response.status}: ${text}`);
  }
  const csv = await response.text();
  if (cachePath) {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, csv);
  }
  return parseCsv(csv);
}

function buildOurAirportsIndex(rows) {
  const index = new Map();
  rows.forEach((row) => {
    const icao = (row.ident || '').toUpperCase();
    if (!icao) {
      return;
    }
    index.set(icao, {
      icao,
      iata: row.iata_code || null,
      name: row.name || null,
      municipality: row.municipality || null,
      iso_country: row.iso_country || null,
    });
  });
  return index;
}

function toAirportEntry(element, countryLangMap, ourIndex) {
  const tags = element.tags || {};
  const icao = tags.icao || null;
  if (!icao) {
    return null;
  }
  const entryKey = icao.toUpperCase();
  const our = ourIndex?.get(entryKey);
  const baseCountry = pickCountry(tags) || normalizeCountry(our?.iso_country);
  const { name_local, local_lang } = pickLocalName(tags, countryLangMap, baseCountry);
  const baseCity = pickCity(tags) || our?.municipality || null;
  const nameEn = tags['name:en'] || our?.name || null;
  const nameValue = tags.name || our?.name || null;
  const nameZh = pickChineseName(tags, baseCountry);
  const nameZhHans = toSimplifiedZh(nameZh);
  return {
    icao: entryKey,
    iata: tags.iata || our?.iata || null,
    name: nameValue,
    name_en: nameEn,
    name_local: name_local || nameValue,
    name_zh: nameZh,
    name_zh_hans: nameZhHans,
    local_lang,
    country: baseCountry,
    city: baseCity,
    lat: element.lat ?? element.center?.lat ?? null,
    lon: element.lon ?? element.center?.lon ?? null,
  };
}

function buildOverpassList(args) {
  if (args.overpassList) {
    return args.overpassList
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (args.overpass) {
    return [args.overpass];
  }
  return DEFAULT_OVERPASS_FALLBACKS.slice();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOverpassOnce(overpass) {
  const query = `
    [out:json][timeout:180];
    (
      node["aeroway"="aerodrome"]["icao"];
      way["aeroway"="aerodrome"]["icao"];
      relation["aeroway"="aerodrome"]["icao"];
    );
    out center tags;
  `;

  const response = await fetch(overpass, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(`Overpass error ${response.status}: ${text}`);
    err.status = response.status;
    throw err;
  }

  return response.json();
}

async function fetchOverpass(overpassList) {
  const maxRetries = Number(process.env.OVERPASS_RETRIES || 3);
  const retryBaseMs = Number(process.env.OVERPASS_RETRY_BASE_MS || 1500);

  for (const endpoint of overpassList) {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await fetchOverpassOnce(endpoint);
      } catch (err) {
        const status = err?.status;
        const retryable = status === 429 || status === 504 || !status;
        if (!retryable || attempt >= maxRetries) {
          if (attempt >= maxRetries) {
            console.warn(`Overpass failed after ${attempt + 1} attempts: ${endpoint}`);
          }
          break;
        }
        const delay = retryBaseMs * Math.pow(2, attempt);
        console.warn(`Overpass retry ${attempt + 1}/${maxRetries} on ${endpoint} after ${delay}ms`);
        await sleep(delay);
      }
    }
  }
  throw new Error('All Overpass endpoints failed.');
}

function buildDataset(elements, countryLangMap, version, ourIndex) {
  const airports = {};

  for (const element of elements) {
    const entry = toAirportEntry(element, countryLangMap, ourIndex);
    if (!entry) {
      continue;
    }
    airports[entry.icao] = entry;
  }

  const now = new Date().toISOString();
  return {
    meta: {
      dataset_version: version || now.slice(0, 10),
      generated_at: now,
      sources: ['OpenStreetMap contributors', 'OurAirports (public domain)'],
    },
    airports,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.out) {
    throw new Error('Missing --out');
  }

  const version = args.version || process.env.DATASET_VERSION || null;
  const countryLangMap = loadCountryLangMap();
  const ourRows = await loadOurAirports(
    args.ourairports,
    args.cache || path.join(__dirname, '..', 'data', 'ourairports.csv')
  );
  const ourIndex = buildOurAirportsIndex(ourRows);
  const payload = await fetchOverpass(buildOverpassList(args));
  const dataset = buildDataset(payload.elements || [], countryLangMap, version, ourIndex);

  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(dataset, null, 2));

  console.log(`Wrote ${Object.keys(dataset.airports).length} airports to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
