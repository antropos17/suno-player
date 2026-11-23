import http from 'node:http';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, rename, copyFile, unlink, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.mp3':'audio/mpeg', '.wav':'audio/wav', '.ogg':'audio/ogg', '.m4a':'audio/mp4', '.aac':'audio/aac', '.flac':'audio/flac', '.webm':'audio/webm' };
const MAX = 200 * 1024 * 1024;
export async function createPlayer({ dataDir = path.join(root, 'data') } = {}) {
  const mediaDir = path.join(dataDir, 'audio');
  await mkdir(mediaDir, { recursive: true });
  const dbPath = path.join(dataDir, 'library.json');
  let songs = [];
  try {
    songs = JSON.parse(await readFile(dbPath, 'utf8'));
    if (!Array.isArray(songs)) throw new Error('Invalid library');
  } catch (e) { if (e.code !== 'ENOENT') throw new Error('Cannot read library.json. Preserve it and restore library.backup.json if needed.', { cause:e }); }
  let queue = Promise.resolve();
  function transaction(fn) {
    const result = queue.then(async () => {
      const next = structuredClone(songs);
      const value = fn(next);
      const tmp = dbPath + '.tmp';
      await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
      try { await copyFile(dbPath, path.join(dataDir, 'library.backup.json')); } catch(e) { if (e.code !== 'ENOENT') throw e; }
      await rename(tmp, dbPath);
      songs = next;
      return value;
    });
    queue = result.catch(() => {});
    return result;
  }
  const server = http.createServer(async (req, res) => {
    const send = (code, value) => { res.writeHead(code, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }); res.end(JSON.stringify(value)); };
    try {
      const host = `127.0.0.1:${server.address().port}`;
      if (req.headers.host !== host) return send(403, {error:'Invalid host'});
      if (req.headers.origin && req.headers.origin !== `http://${host}`) return send(403, {error:'Invalid origin'});
      const url = new URL(req.url, `http://${host}`);
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Referrer-Policy','no-referrer');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
      if (url.pathname === '/api/songs' && req.method === 'GET') return send(200, songs);
      if (url.pathname === '/api/songs' && req.method === 'POST') {
        if (req.headers['content-type'] !== 'application/octet-stream') return send(415,{error:'Use an audio file'});
        let filename;
        try { filename = decodeURIComponent(req.headers['x-file-name'] || ''); } catch { return send(400,{error:'Invalid filename'}); }
        const ext = path.extname(filename).toLowerCase();
        if (!types[ext]) return send(415, {error:'Unsupported audio format'});
        if (Number(req.headers['content-length']) > MAX) return send(413,{error:'File exceeds 200 MB'});
        const id = randomUUID();
        const file = id + ext;
        const target = path.join(mediaDir, file);
        let bytes = 0;
        const limiter = new Transform({ transform(chunk, enc, cb) { bytes += chunk.length; cb(bytes > MAX ? new Error('File exceeds 200 MB') : null, chunk); } });
        try {
          await pipeline(req, limiter, createWriteStream(target,{flags:'wx'}));
          if (!bytes) throw new Error('Empty audio file');
          const song = { id, file, title:path.basename(filename, path.extname(filename)).slice(0,300), styles:'', lyrics:'', addedAt:new Date().toISOString() };
          await transaction(next => next.push(song));
          return send(201, song);
        } catch (e) { await unlink(target).catch(()=>{}); throw e; }
      }
      const match = url.pathname.match(/^\/api\/songs\/([a-f0-9-]{36})$/);
      if (match && req.method === 'PATCH') {
        if (req.headers['content-type'] !== 'application/json') return send(415,{error:'JSON required'});
        let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 150000) return send(413,{error:'Text is too long'}); }
        let update; try { update = JSON.parse(body); } catch { return send(400,{error:'Invalid JSON'}); }
        if (!update || typeof update !== 'object' || Array.isArray(update)) return send(400,{error:'Invalid fields'});
        if (Object.keys(update).some(k=>!['title','styles','lyrics'].includes(k))) return send(400,{error:'Unknown fields'});
        for (const [key, val] of Object.entries(update)) if (typeof val !== 'string' || val.length > ({title:300,styles:3000,lyrics:100000}[key]) || (key==='title' && !val.trim())) return send(400,{error:'Invalid text length'});
        const result = await transaction(next => { const s = next.find(s=>s.id===match[1]); if (!s) return null; Object.assign(s,update); return s; });
        return send(result ? 200 : 404, result || {error:'Song not found'});
      }
      if (url.pathname.startsWith('/audio/') && ['GET','HEAD'].includes(req.method)) {
        const song = songs.find(s=>s.file === url.pathname.slice(7));
        if (!song) return send(404,{error:'Song not found'});
        const target = path.join(mediaDir, path.basename(song.file));
        const info = await stat(target);
        let start=0, end=info.size-1, code=200;
        if (req.headers.range) {
          const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
          if (!range || Number(range[1]) >= info.size || (range[2] && Number(range[2]) < Number(range[1]))) { res.writeHead(416,{'Content-Range':`bytes */${info.size}`}); return res.end(); }
          start=Number(range[1]); end=range[2] ? Math.min(Number(range[2]),end) : end; code=206;
          res.setHeader('Content-Range',`bytes ${start}-${end}/${info.size}`);
        }
        res.writeHead(code,{'Content-Type':types[path.extname(song.file)],'Content-Length':end-start+1,'Accept-Ranges':'bytes'});
        if (req.method==='HEAD') return res.end();
        const stream=createReadStream(target,{start,end}); stream.on('error',()=>res.destroy()); res.on('close',()=>stream.destroy()); stream.pipe(res); return;
      }
      const files = { '/':'index.html', '/app.js':'app.js', '/style.css':'style.css' };
      if (files[url.pathname] && req.method === 'GET') {
        const name=files[url.pathname];
        res.writeHead(200,{'Content-Type':name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-cache'});
        return res.end(await readFile(path.join(root,'public',name)));
      }
      send(404,{error:'Not found'});
    } catch(e) { if (!res.headersSent && !res.destroyed) send(500,{error:'Не удалось сохранить или прочитать файл. Проверьте место на диске и повторите.'}); }
  });
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createPlayer();
  server.listen(47831,'127.0.0.1',()=>console.log('Suno Player: http://127.0.0.1:47831'));
  server.on('error', e=>{ console.error(e.code==='EADDRINUSE'?'Port 47831 is already in use. Open the existing player or close that process.':e.message); process.exitCode=1; });
}
