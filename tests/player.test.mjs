import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createPlayer } from '../server.mjs';

test('import, edit, range playback, validation, and restart persistence', async () => {
  const dataDir=await mkdtemp(path.resolve('.test-data-'));
  let server;
  async function start(){server=await createPlayer({dataDir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}`;}
  async function close(){await new Promise(resolve=>server.close(resolve));}
  try {
    let url=await start();
    const wave=Buffer.alloc(8044);wave.write('RIFF',0);wave.writeUInt32LE(8036,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(8000,24);wave.writeUInt32LE(8000,28);wave.writeUInt16LE(1,32);wave.writeUInt16LE(8,34);wave.write('data',36);wave.writeUInt32LE(8000,40);wave.fill(128,44);
    let r=await fetch(url+'/api/songs',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent('Песня & <ночь>.wav')},body:wave});assert.equal(r.status,201);
    const song=await r.json();assert.equal(song.title,'Песня & <ночь>');
    r=await fetch(url+'/api/songs/'+song.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Новое название',styles:'indie, ambient',lyrics:'[Verse]\nНовый текст\n<script>safe text</script>'})});assert.equal(r.status,200);
    r=await fetch(url+'/audio/'+song.file,{headers:{Range:'bytes=44-143'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 44-143/8044');assert.deepEqual(Buffer.from(await r.arrayBuffer()),wave.subarray(44,144));
    r=await fetch(url+'/audio/'+song.file,{headers:{Range:'bytes=99999-'}});assert.equal(r.status,416);
    for(const update of [{title:''},{file:'../secret'},{lyrics:42}]){r=await fetch(url+'/api/songs/'+song.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(update)});assert.equal(r.status,400);}
    r=await fetch(url+'/api/songs',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':'bad.exe'},body:'x'});assert.equal(r.status,415);
    r=await fetch(url+'/api/songs',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':'empty.wav'},body:''});assert.equal(r.status,500);
    r=await fetch(url+'/api/songs',{headers:{Origin:'https://example.com'}});assert.equal(r.status,403);
    r=await fetch(url+'/data/library.json');assert.equal(r.status,404);
    const backup=JSON.parse(await readFile(path.join(dataDir,'library.backup.json'),'utf8'));assert.equal(backup[0].title,'Песня & <ночь>');
    await close();url=await start();
    const saved=await(await fetch(url+'/api/songs')).json();assert.equal(saved.length,1);assert.equal(saved[0].title,'Новое название');assert.equal(saved[0].styles,'indie, ambient');assert.match(saved[0].lyrics,/Новый текст/);
    assert.deepEqual(await readFile(path.join(dataDir,'audio',song.file)),wave);
  } finally {if(server?.listening)await close();assert.equal(path.dirname(dataDir),process.cwd());await rm(dataDir,{recursive:true,force:true});}
});
