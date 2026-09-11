// Build-time ingestion of IMDb's official non-commercial dataset.
// Source: https://datasets.imdbws.com/title.ratings.tsv.gz (IMDb Non-Commercial
// Datasets - personal/non-commercial use, refreshed daily by IMDb).
// Emits small sharded JSON lookup files the PWA lazy-loads per title and caches
// on-device; the multi-hundred-MB source never touches the client.
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://datasets.imdbws.com/title.ratings.tsv.gz';
const MIN_VOTES = Number(process.env.IMDB_MIN_VOTES ?? 1000);
const SHARD_COUNT = 128;
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'imdb-ratings');

// Pass a pre-downloaded .tsv.gz path as argv[2] to skip the network fetch.
import { createReadStream } from 'node:fs';
const localFile = process.argv[2];
let inputStream;
if (localFile) {
  inputStream = createReadStream(localFile);
} else {
  const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(120000) });
  if (!res.ok || !res.body) throw new Error(`IMDb dataset fetch failed: ${res.status}`);
  inputStream = Readable.fromWeb(res.body);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const shards = Array.from({ length: SHARD_COUNT }, () => Object.create(null));
let total = 0, kept = 0;
const rl = createInterface({ input: inputStream.pipe(createGunzip()), crlfDelay: Infinity });
for await (const line of rl) {
  total++;
  if (total === 1) continue; // header
  const tab1 = line.indexOf('\t');
  if (tab1 < 3) continue;
  const tab2 = line.indexOf('\t', tab1 + 1);
  const tconst = line.slice(0, tab1);
  const rating = Number(line.slice(tab1 + 1, tab2));
  const votes = Number(line.slice(tab2 + 1));
  if (!tconst.startsWith('tt') || !Number.isFinite(rating) || !Number.isFinite(votes) || votes < MIN_VOTES) continue;
  const shard = Number(tconst.slice(2)) % SHARD_COUNT;
  shards[shard][tconst] = [Math.round(rating * 10), votes];
  kept++;
}

let bytes = 0;
for (let i = 0; i < SHARD_COUNT; i++) {
  const json = JSON.stringify(shards[i]);
  bytes += json.length;
  writeFileSync(path.join(outDir, `r${String(i).padStart(3, '0')}.json`), json);
}
const manifest = {
  source: 'IMDb Non-Commercial Datasets (title.ratings)',
  sourceUrl: 'https://datasets.imdbws.com/',
  license: 'Personal/non-commercial use per IMDb terms',
  generatedAt: new Date().toISOString(),
  minVotes: MIN_VOTES,
  titles: kept,
  shardCount: SHARD_COUNT
};
writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(manifest, null, 2));
console.log(`rows scanned: ${total - 1}`);
console.log(`titles kept (votes >= ${MIN_VOTES}): ${kept}`);
console.log(`shards: ${SHARD_COUNT}, total shard bytes: ${bytes} (~${(bytes / 1024 / 1024).toFixed(2)} MB, ~${(bytes / SHARD_COUNT / 1024).toFixed(1)} KB/shard)`);
