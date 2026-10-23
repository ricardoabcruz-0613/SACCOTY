import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './database.mjs';
import {createHandler} from '../server/app.mjs';
const origin='https://cheery-saccoty-star.netlify.app',password='Senha-teste-segura-123',env={PUBLIC_ORIGIN:origin,SETUP_KEY:'chave-de-teste-isolado-com-mais-de-32-caracteres'};
test('API Netlify / PostgreSQL: acesso, equipe, estoque, saldo, estorno e persistência',async()=>{
 const db=await testDatabase(),getPool=()=>db.pool,handle=createHandler({getPool,env,log:()=>{}}),guest={};
 async function call(client,path,data,extra={}){let response=await handle(new Request(origin+'/api/'+path,{method:data?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:client.cookie||'','X-CSRF-Token':client.csrf||'',...extra},body:data?JSON.stringify(data):undefined}),{ip:'test-'+(client.ip||'default')});let cookie=response.headers.get('set-cookie');if(cookie)client.cookie=cookie.split(';')[0];assert.match(response.headers.get('content-type'),/application\/json/);return {status:response.status,data:await response.json(),response}}
 async function login(email){let c={ip:email};let result=await call(c,'login',{email,password});assert.equal(result.status,200,JSON.stringify(result.data));let state=await call(c,'state');c.csrf=state.data.csrf;return c}
 try{
 assert.equal((await call(guest,'state')).status,401);
 assert.equal((await call(guest,'setup',{key:'errada',name:'Admin',email:'admin@example.com',password})).status,403);
 assert.equal((await call(guest,'register',{name:'Intruso',email:'intruso@example.com',password})).status,428);
 assert.equal((await call(guest,'setup',{key:env.SETUP_KEY,name:'Admin',email:'admin@example.com',password})).status,200);
 assert.equal((await call(guest,'setup',{key:env.SETUP_KEY,name:'Outro',email:'outro@example.com',password})).status,409);
 let admin=await login('admin@example.com');assert.match(admin.cookie,/sid=/);
 assert.equal((await call(admin,'credit',{uid:1,amount:100,reason:'X',request:randomUUID()},{Origin:'https://outro.example'})).status,403);
 for(let [name,email] of [['Pessoa A','a@example.com'],['Pessoa B','b@example.com'],['Gestor','g@example.com']])assert.equal((await call(guest,'register',{name,email,password,role:'Administrador',balance:99999})).status,200);
 assert.equal((await call({ip:'pending'},'login',{email:'a@example.com',password})).status,401);
 let s=(await call(admin,'state')).data,a=s.users.find(u=>u.email==='a@example.com'),b=s.users.find(u=>u.email==='b@example.com'),g=s.users.find(u=>u.email==='g@example.com');assert.equal(a.balance,0);assert.equal(a.role,'Colaborador');assert.equal(JSON.stringify(s).includes('password'),false);
 for(let [id,role,team] of [[a.id,'Colaborador','SAC'],[b.id,'Colaborador','Outro'],[g.id,'Gestor','SAC']])assert.equal((await call(admin,'user',{id,role,team,active:true})).status,200);
 let ca=await login('a@example.com'),cb=await login('b@example.com'),cg=await login('g@example.com');
 assert.equal((await call(ca,'credit',{uid:a.id,amount:100,reason:'Fraude',request:randomUUID()})).status,403);
 assert.equal((await call(cg,'credit',{uid:b.id,amount:100,reason:'Meta',request:randomUUID()})).status,403);
 assert.equal((await call(cg,'credit',{uid:g.id,amount:100,reason:'Auto',request:randomUUID()})).status,403);
 let credit={uid:a.id,amount:100,reason:'Meta',request:randomUUID()};assert.equal((await call(cg,'credit',credit)).status,200);assert.equal((await call(cg,'credit',credit)).status,200);assert.equal((await call(cg,'credit',{...credit,amount:500})).status,409);
 assert.equal((await call(ca,'state')).data.users[0].balance,100);
 assert.equal((await call(admin,'product',{name:'Produto',description:'Teste',category:'Dia a dia',price:60,stock:1})).status,200);let p=(await call(ca,'state')).data.products[0];
 assert.equal((await call(ca,'product',{name:'Fraude'})).status,403);
 assert.equal((await call(admin,'product',{name:'Foto',description:'Teste',category:'Dia a dia',price:10,stock:1,image:'data:image/png;base64,SGVsbG8='})).status,400);
 assert.equal((await call(ca,'order',{request:randomUUID(),items:[{id:p.id,qty:1,price:1}]})).status,409);
 assert.equal((await call(admin,'credit',{uid:b.id,amount:100,reason:'Meta',request:randomUUID()})).status,200);
 let ra={request:randomUUID(),items:[{id:p.id,qty:1,price:60}]},rb={request:randomUUID(),items:[{id:p.id,qty:1,price:60}]};
 let results=await Promise.all([call(ca,'order',ra),call(cb,'order',rb)]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);let winner=results[0].status===200?ca:cb,winReq=winner===ca?ra:rb,id=results.find(x=>x.status===200).data.id;
 assert.equal((await call(winner,'order',winReq)).data.id,id);assert.equal((await call(admin,'state')).data.orders.length,1);assert.equal((await call(winner,'state')).data.users[0].balance,40);
 assert.equal((await call(ca,'order-status',{id,status:'Cancelado'})).status,403);
 assert.equal((await call(admin,'order-status',{id,status:'Cancelado'})).status,200);assert.equal((await call(admin,'order-status',{id,status:'Cancelado'})).status,200);
 s=(await call(admin,'state')).data;assert.equal(s.products[0].stock,1);assert.equal(s.users.find(u=>u.id===a.id).balance,100);assert.equal(s.users.find(u=>u.id===b.id).balance,100);
 assert.equal((await call(admin,'order-status',{id,status:'Entregue'})).status,409);
 assert.equal((await call(admin,'product',{name:'Caro',description:'Teste',category:'Dia a dia',price:200,stock:1})).status,200);let caro=(await call(ca,'state')).data.products.find(p=>p.name==='Caro');
 assert.equal((await call(ca,'order',{request:randomUUID(),items:[{id:caro.id,qty:1,price:200}]})).status,409);assert.equal((await call(ca,'state')).data.products.find(p=>p.id===caro.id).stock,1);
 const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
 assert.equal((await call(admin,'product',{name:'Com foto',description:'Foto',category:'Dia a dia',price:10,stock:2,image:photo})).status,200);
 const withImage=(await call(ca,'state')).data.products.find(p=>p.name==='Com foto');assert.equal(withImage.image,'/api/image/'+withImage.id);
 let photoResponse=await handle(new Request(origin+withImage.image,{headers:{Cookie:ca.cookie}}));assert.equal(photoResponse.status,200);assert.equal(photoResponse.headers.get('content-type'),'image/png');assert.equal((await photoResponse.arrayBuffer()).byteLength,Buffer.from(photo.split(',')[1],'base64').length);
 assert.equal((await call(admin,'product',{...withImage,name:'Foto editada'})).status,200);
 photoResponse=await handle(new Request(origin+withImage.image,{headers:{Cookie:ca.cookie}}));assert.equal(photoResponse.status,200);
 assert.equal((await handle(new Request(origin+withImage.image))).status,401);
 assert.equal((await call({...admin,csrf:'errado'},'credit',credit)).status,403);
 assert.equal((await call(cg,'state')).data.users.some(u=>u.id===b.id),false);assert.equal((await call(cb,'state')).data.orders.length,winner===cb?1:0);
 assert.equal((await call(admin,'reset-password',{id:a.id,password:'Outra-senha-segura-123'})).status,200);assert.equal((await call(ca,'state')).status,401);
 let freshHandler=createHandler({getPool,env});let r=await freshHandler(new Request(origin+'/api/state',{headers:{Cookie:admin.cookie}}));assert.equal(r.status,200);assert.equal((await r.json()).orders.length,1);
 let stored=(await db.pool.query('SELECT password FROM users WHERE id=$1',[a.id])).rows[0].password;assert.notEqual(stored,'Outra-senha-segura-123');assert.match(stored,/^[a-f0-9]{32}:[a-f0-9]{128}$/);
 for(let i=0;i<10;i++)await call({ip:'limiter-'+i},'login',{email:'naoexiste@example.com',password});assert.equal((await call({ip:'limiter-final'},'login',{email:'naoexiste@example.com',password})).status,429);
 }finally{await db.close()}
});
test('Erros de configuração retornam JSON e não HTML',async()=>{
 let handle=createHandler({getPool:()=>{throw Object.assign(Error('Banco não configurado'),{status:503})},env,log:()=>{}});
 let r=await handle(new Request(origin+'/api/state'));assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'Banco não configurado'});
 let bad=createHandler({getPool:()=>{},env:{}});r=await bad(new Request(origin+'/api/state'));assert.equal(r.status,503);
});
