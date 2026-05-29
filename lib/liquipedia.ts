// Liquipedia API client.
//
// Liquipedia is a community wiki, not a structured API. We use the MediaWiki
// parse endpoint to fetch wiki text + the parsed HTML of specific section.
//
// Strict requirements per liquipedia.net/api-terms-of-use:
//   - Custom descriptive User-Agent (project name + contact)
//   - 1 req / 2 sec for parse endpoint (we do 1/3s to be safe)
//   - 30 req / 30 sec for raw API
//
// We also wrap responses in a 1-hour TTL cache to minimize traffic. Liquipedia
// data doesn't change minute-by-minute - tournament schedules change daily at most.

const UA = 'dota-predictor/0.2 (https://github.com/; tournament prediction tool)';
const PARSE_BASE = 'https://liquipedia.net/dota2/api.php';
const MIN_INTERVAL_MS = 3000; // self-rate-limit: 1 req per 3s

type CacheEntry<T> = { value: T; expires: number };
const cache = new Map<string, CacheEntry<unknown>>();
let lastFetchAt = 0;
const queue: Array<() => void> = [];
let processing = false;

async function throttle<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    queue.push(async () => {
      try {
        const wait = Math.max(0, lastFetchAt + MIN_INTERVAL_MS - Date.now());
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        lastFetchAt = Date.now();
        const v = await fn();
        resolve(v);
      } catch (e) {
        reject(e);
      }
    });
    if (!processing) {
      processing = true;
      (async () => {
        while (queue.length) {
          const task = queue.shift();
          if (task) await task();
        }
        processing = false;
      })();
    }
  });
}

async function rawFetch(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Liquipedia ${res.status} on ${url}`);
  return res.text();
}

interface ParseResult {
  parse?: {
    title: string;
    text: { '*': string };
    wikitext?: { '*': string };
  };
  error?: { code: string; info: string };
}

async function parsePage(page: string): Promise<ParseResult | null> {
  const cacheKey = `parse:${page}`;
  const hit = cache.get(cacheKey) as CacheEntry<ParseResult> | undefined;
  if (hit && hit.expires > Date.now()) return hit.value;
  try {
    const url = `${PARSE_BASE}?action=parse&page=${encodeURIComponent(page)}&format=json&prop=text|wikitext&redirects=1`;
    const json = await throttle(() => rawFetch(url));
    const data = JSON.parse(json) as ParseResult;
    cache.set(cacheKey, { value: data, expires: Date.now() + 60 * 60 * 1000 });
    return data;
  } catch (e) {
    console.warn(`Liquipedia parse failed for ${page}:`, (e as Error).message);
    return null;
  }
}

// ───────── Tournament list extraction ─────────
//
// The "Portal:Tournaments" page is a curated list of upcoming/ongoing/recent
// tournaments. Its wikitext uses Liquipedia's tournament card template which we
// can parse with regex - we don't need a full wiki parser.

export interface LpTournament {
  name: string;
  liquipediaPage: string;     // e.g. "The_International/2026"
  tier: string;               // "S-Tier" / "A-Tier" / "Major" / etc.
  startDate: string | null;   // ISO
  endDate: string | null;
  prizePool: string | null;
  status: 'upcoming' | 'ongoing' | 'completed';
}

// Match {{Infobox league/Tournaments page rows that look like:
//   |tournament=The International 2026 |link=The_International/2026 |tier=S
//   |start=2026-08-15 |end=2026-08-25 |prize=$40,000,000
// They differ by year, so we use a flexible regex.

function safeMatch(re: RegExp, s: string): string | null {
  const m = s.match(re);
  return m ? m[1].trim() : null;
}

function parseTournamentsFromWikitext(wikitext: string): LpTournament[] {
  const blocks = wikitext.split(/\{\{TournamentsList\/(Upcoming|Ongoing|Completed)/i);
  // blocks: [pre, status1, content1, status2, content2, …]
  const results: LpTournament[] = [];
  for (let i = 1; i < blocks.length; i += 2) {
    const statusToken = blocks[i].toLowerCase();
    const status: LpTournament['status'] =
      statusToken === 'upcoming'
        ? 'upcoming'
        : statusToken === 'ongoing'
          ? 'ongoing'
          : 'completed';
    const body = blocks[i + 1] ?? '';
    // Each tournament row is bounded by {{Tournament Card/... | … }}
    const rowRe = /\{\{[^}]*tournament[^}]*?\|([^}]+?)\}\}/gi;
    let row: RegExpExecArray | null;
    while ((row = rowRe.exec(body)) !== null) {
      const fields = row[1];
      const name =
        safeMatch(/name\s*=\s*([^\n|]+)/i, fields) ||
        safeMatch(/tournament\s*=\s*([^\n|]+)/i, fields);
      if (!name) continue;
      const link = safeMatch(/link\s*=\s*([^\n|]+)/i, fields) || name.replace(/ /g, '_');
      const tier = safeMatch(/tier\s*=\s*([^\n|]+)/i, fields) || 'unknown';
      const start = safeMatch(/(?:start|sdate)\s*=\s*([0-9-]+)/i, fields);
      const end = safeMatch(/(?:end|edate)\s*=\s*([0-9-]+)/i, fields);
      const prize = safeMatch(/prize(?:pool)?\s*=\s*([^\n|]+)/i, fields);
      results.push({
        name,
        liquipediaPage: link,
        tier,
        startDate: start,
        endDate: end,
        prizePool: prize,
        status,
      });
    }
  }
  return results;
}

// Stop-gap heuristic: if regex parsing fails (Liquipedia changes templates),
// fall back to extracting just bolded headers from HTML.
function extractFromHtml(html: string): LpTournament[] {
  const links = [...html.matchAll(/href="\/dota2\/([A-Z][A-Za-z0-9_\/]+)"[^>]*>([^<]{4,80})</g)];
  const seen = new Set<string>();
  const out: LpTournament[] = [];
  for (const m of links) {
    const page = m[1];
    const name = m[2].trim();
    if (seen.has(page)) continue;
    if (!/Tour|League|Major|International|Championship|DPC|ESL|PGL|BLAST|Riyadh/i.test(name + page)) continue;
    seen.add(page);
    out.push({
      name,
      liquipediaPage: page,
      tier: 'unknown',
      startDate: null,
      endDate: null,
      prizePool: null,
      status: 'ongoing',
    });
    if (out.length >= 30) break;
  }
  return out;
}

export async function getTournaments(): Promise<LpTournament[]> {
  const data = await parsePage('Portal:Tournaments');
  if (!data?.parse) return [];
  const wikitext = data.parse.wikitext?.['*'] ?? '';
  const html = data.parse.text?.['*'] ?? '';
  let list = parseTournamentsFromWikitext(wikitext);
  if (list.length === 0) list = extractFromHtml(html);
  return list;
}

// ───────── Team metadata ─────────

export interface LpTeam {
  name: string;
  liquipediaPage: string;
  region?: string;
  roster: Array<{ id: string; role?: string }>;
  logoUrl?: string;
}

export async function getTeam(pageName: string): Promise<LpTeam | null> {
  const data = await parsePage(pageName);
  if (!data?.parse) return null;
  const wikitext = data.parse.wikitext?.['*'] ?? '';
  // {{Infobox team … |name=… |region=… |roster=…}}
  const name = safeMatch(/\|\s*name\s*=\s*([^\n|]+)/i, wikitext) || pageName;
  const region = safeMatch(/\|\s*region\s*=\s*([^\n|]+)/i, wikitext) || undefined;
  // Active players: {{Player|id=…|role=…}}
  const playerRe = /\{\{Player\s*\|\s*id\s*=\s*([^|}]+)(?:\|[^}]*role\s*=\s*([^|}]+))?[^}]*\}\}/gi;
  const roster: LpTeam['roster'] = [];
  let m: RegExpExecArray | null;
  while ((m = playerRe.exec(wikitext)) !== null) {
    roster.push({ id: m[1].trim(), role: m[2]?.trim() });
    if (roster.length >= 10) break;
  }
  return { name, liquipediaPage: pageName, region, roster };
}
