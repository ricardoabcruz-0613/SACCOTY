import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
// Um processo PostgreSQL embutido para os testes; nunca recebe dados de produção.
export async function testDatabase(){
 const engine=new PGlite();await engine.exec(await readFile(new URL('../netlify/database/migrations/202610230001_clube.sql',import.meta.url),'utf8'));
 let tail=Promise.resolve();async function lock(){let release;let gate=new Promise(r=>release=r),before=tail;tail=tail.then(()=>gate);await before;return release}
 const pool={query:async(sql,args)=>{let release=await lock();try{return await engine.query(sql,args)}finally{release()}},connect:async()=>{let release=await lock();return {query:(sql,args)=>engine.query(sql,args),release}}};
 return {pool,engine,close:()=>engine.close()};
}
