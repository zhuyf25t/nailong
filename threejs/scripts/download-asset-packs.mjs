/** Downloads only the publicly offered free Standard archives via itch.io's normal free-download flow.
 * Session cookies and signed URLs remain in memory and are never logged or saved.
 * Run from threejs: node scripts/download-asset-packs.mjs [--inspect]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const cache = path.resolve('.asset-cache');
await fs.mkdir(cache, { recursive: true });
const packs = [
  { slug: 'sci-fi-essentials-kit', name: 'Sci-Fi Essentials Kit', local: 'scifi-standard' },
  { slug: 'fantasy-props-megakit', name: 'Fantasy Props MegaKit', local: 'fantasy-props-standard' },
];

async function downloadPack(pack) {
  const page = `https://quaternius.itch.io/${pack.slug}`;
  const archive = path.join(cache, `${pack.local}.zip`);
  try { await fs.access(archive); console.log(`${pack.name}: existing archive retained`); return; } catch {}
  const cookies = new Map();
  async function request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), Referer: page, ...options.headers },
    });
    for (const cookie of response.headers.getSetCookie()) {
      const item = cookie.split(';')[0]; const offset = item.indexOf('=');
      cookies.set(item.slice(0, offset), item.slice(offset + 1));
    }
    if (!response.ok) throw new Error(`${pack.name}: HTTP ${response.status}`);
    return response;
  }
  const html = await (await request(page)).text();
  const csrf = html.match(/name="csrf_token"\s+value="([^"]+)"/)?.[1];
  if (!csrf) throw new Error('Public page has no CSRF token');
  const grant = await (await request(`${page}/download_url`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf_token: csrf }),
  })).json();
  if (!grant.url) throw new Error('Free download page unavailable');
  const downloadHtml = await (await request(grant.url)).text();
  const standardIndex = downloadHtml.indexOf(`${pack.name}[Standard].zip`);
  if (standardIndex < 0) throw new Error('Expected free Standard archive not listed');
  const surroundings = downloadHtml.slice(Math.max(0, standardIndex - 600), standardIndex + 300);
  const uploadId = surroundings.match(/data-upload_id="(\d+)"/)?.[1];
  if (process.argv.includes('--inspect')) {
    console.log(pack.name, surroundings.replace(/href="[^"]+"/g, 'href="[omitted]"')); return;
  }
  if (!uploadId) throw new Error('Standard upload identifier unavailable');
  const downloadCsrf = downloadHtml.match(/name="csrf_token"\s+value="([^"]+)"/)?.[1] ?? csrf;
  const fileGrant = await (await request(`${page}/file/${uploadId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: grant.url },
    body: new URLSearchParams({ csrf_token: downloadCsrf }),
  })).json();
  if (!fileGrant.url) throw new Error('Standard file download unavailable');
  console.log(`${pack.name}: downloading free Standard archive`);
  const probe = await fetch(fileGrant.url, { headers: { Range: 'bytes=0-0' } });
  const length = Number(probe.headers.get('content-range')?.split('/')[1]);
  const rangeSupported = probe.status === 206 && length > 0;
  await probe.body?.cancel();
  console.log(`${pack.name}: ${length} bytes; range support ${rangeSupported}`);
  const temporary = `${archive}.part`;
  if (rangeSupported) {
    const chunkSize = 8 * 1024 * 1024;
    const chunks = Math.ceil(length / chunkSize);
    let next = 0;
    async function worker() {
      while (next < chunks) {
        const index = next++;
        const begin = index * chunkSize;
        const end = Math.min(length - 1, begin + chunkSize - 1);
        const chunkPath = `${temporary}.${index}`;
        try { if ((await fs.stat(chunkPath)).size === end - begin + 1) continue; } catch {}
        const response = await fetch(fileGrant.url, { headers: { Range: `bytes=${begin}-${end}` } });
        if (response.status !== 206 || !response.body) throw new Error(`Range HTTP ${response.status}`);
        if (response.headers.get('content-range') !== `bytes ${begin}-${end}/${length}`) throw new Error('Unexpected content range');
        await pipeline(Readable.fromWeb(response.body), createWriteStream(chunkPath));
        if ((await fs.stat(chunkPath)).size !== end - begin + 1) throw new Error('Truncated range');
        console.log(`${pack.name}: part ${index + 1}/${chunks}`);
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker));
    const output = await fs.open(temporary, 'w');
    try { for (let index = 0; index < chunks; index++) await output.write(await fs.readFile(`${temporary}.${index}`)); }
    finally { await output.close(); }
    for (let index = 0; index < chunks; index++) await fs.unlink(`${temporary}.${index}`);
  } else {
    const response = await fetch(fileGrant.url);
    if (!response.ok || !response.body) throw new Error(`Archive HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
  }
  await fs.rename(temporary, archive);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  const metadata = {
    name: pack.name, author: 'Quaternius', edition: 'Standard', license: 'CC0-1.0',
    source: page, downloadedAt: new Date().toISOString(), archive: path.basename(archive),
    bytes: (await fs.stat(archive)).size, sha256: hash.digest('hex'),
    extractedDirectory: pack.local,
  };
  await fs.writeFile(path.join(cache, `${pack.local}.download.json`), `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(JSON.stringify(metadata));
}

const results = await Promise.allSettled(packs.map(downloadPack));
for (const result of results) if (result.status === 'rejected') throw result.reason;
