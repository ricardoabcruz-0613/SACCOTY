import {readFile,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const files=['server/app.mjs','server/database.mjs','netlify/functions/api.mjs','public/app.js'];
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status)process.exit(result.status)}
await access('public/index.html');await access('netlify/database/migrations/202610230001_clube.sql');
const html=await readFile('public/index.html','utf8');if(!html.includes('src="/app.js"'))throw Error('Referência de script ausente.');
console.log('Arquivos e sintaxe verificados. A publicação precisa instalar Functions e aplicar a migração PostgreSQL.');
