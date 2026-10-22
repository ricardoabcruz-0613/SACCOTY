'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http');
test('Contas, permissões, transações e persistência',async()=>{let dir=fs.mkdtempSync(path.join(os.tmpdir(),'coty-test-'));process.env.DATA_DIR=dir;process.env.PUBLIC_ORIGIN='http://localhost:18787';let {db,handler}=require('./server.cjs');let server=http.createServer(handler);await new Promise(r=>server.listen(18787,'127.0.0.1',r));server.unref();let hash=p=>{let s=crypto.randomBytes(16).toString('hex');return s+':'+crypto.scryptSync(p,s,64).toString('hex')};db.prepare("INSERT INTO users(name,email,password,role,active) VALUES(?,?,?,'Administrador',1)").run('Admin','admin@example.com',hash('Senha-forte-teste-123'));
async function call(client,endpoint,data){let r=await fetch('http://localhost:18787/api/'+endpoint,{method:data?'POST':'GET',headers:{Origin:process.env.PUBLIC_ORIGIN,'Content-Type':'application/json',Cookie:client.cookie||'','X-CSRF-Token':client.csrf||''},body:data?JSON.stringify(data):undefined});let c=r.headers.get('set-cookie');if(c)client.cookie=c.split(';')[0];return {status:r.status,data:await r.json()}}
async function login(email){let c={};assert.equal((await call(c,'login',{email,password:'Senha-forte-teste-123'})).status,200);let state=await call(c,'state');c.csrf=state.data.csrf;return c}
let admin=await login('admin@example.com'),guest={};
try{
assert.equal((await call(guest,'state')).status,401);
for(let [name,email] of [['Pessoa A','a@example.com'],['Pessoa B','b@example.com'],['Gestor','g@example.com']])assert.equal((await call(guest,'register',{name,email,password:'Senha-forte-teste-123',role:'Administrador',balance:999999})).status,200);
assert.equal((await call({},'login',{email:'a@example.com',password:'Senha-forte-teste-123'})).status,401);
let users=(await call(admin,'state')).data.users,a=users.find(u=>u.email==='a@example.com'),b=users.find(u=>u.email==='b@example.com'),g=users.find(u=>u.email==='g@example.com');assert.equal(a.balance,0);assert.equal(a.role,'Colaborador');
for(let [id,role,team] of [[a.id,'Colaborador','SAC'],[b.id,'Colaborador','Outro'],[g.id,'Gestor','SAC']])assert.equal((await call(admin,'user',{id,role,team,active:true})).status,200);
let ca=await login('a@example.com'),cb=await login('b@example.com'),cg=await login('g@example.com');
assert.equal((await call(ca,'credit',{uid:a.id,amount:100,reason:'Fraude',request:crypto.randomUUID()})).status,403);
assert.equal((await call(cg,'credit',{uid:b.id,amount:100,reason:'Meta',request:crypto.randomUUID()})).status,403);
let credit={uid:a.id,amount:100,reason:'Meta',request:crypto.randomUUID()};assert.equal((await call(cg,'credit',credit)).status,200);assert.equal((await call(cg,'credit',credit)).status,200);assert.equal((await call(ca,'state')).data.users[0].balance,100);
assert.equal((await call(admin,'product',{name:'Produto',description:'Teste',category:'Dia a dia',price:60,stock:1})).status,200);let product=(await call(ca,'state')).data.products[0];
assert.equal((await call(ca,'product',{name:'Inválido'})).status,403);
assert.equal((await call(ca,'order',{request:crypto.randomUUID(),items:[{id:product.id,qty:1,price:1}]})).status,409);
assert.equal((await call(admin,'credit',{uid:b.id,amount:100,reason:'Meta',request:crypto.randomUUID()})).status,200);
let reqA={request:crypto.randomUUID(),items:[{id:product.id,qty:1,price:60}]},reqB={request:crypto.randomUUID(),items:[{id:product.id,qty:1,price:60}]};let results=await Promise.all([call(ca,'order',reqA),call(cb,'order',reqB)]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);let winner=results[0].status===200?ca:cb,wreq=winner===ca?reqA:reqB,id=results.find(x=>x.status===200).data.id;
assert.equal((await call(winner,'order',wreq)).data.id,id);assert.equal((await call(admin,'state')).data.orders.length,1);
assert.equal((await call(winner,'state')).data.users.find(u=>u.id===(winner===ca?a.id:b.id)).balance,40);
assert.equal((await call(ca,'order-status',{id,status:'Cancelado'})).status,403);
assert.equal((await call(admin,'order-status',{id,status:'Cancelado'})).status,200);assert.equal((await call(admin,'order-status',{id,status:'Cancelado'})).status,200);
let s=(await call(admin,'state')).data;assert.equal(s.products[0].stock,1);assert.equal(s.users.find(u=>u.id===a.id).balance,100);assert.equal(s.users.find(u=>u.id===b.id).balance,100);
assert.equal((await call(admin,'order-status',{id,status:'Entregue'})).status,409);
assert.equal((await call(admin,'product',{name:'Caro',description:'Teste',category:'Dia a dia',price:200,stock:1})).status,200);let expensive=(await call(ca,'state')).data.products.find(p=>p.name==='Caro');assert.equal((await call(ca,'order',{request:crypto.randomUUID(),items:[{id:expensive.id,qty:1,price:200}]})).status,409);assert.equal((await call(ca,'state')).data.products.find(p=>p.id===expensive.id).stock,1);
let bad={...admin,csrf:'invalido'};assert.equal((await call(bad,'credit',credit)).status,403);
assert.equal((await call(admin,'reset-password',{id:a.id,password:'Nova-senha-segura-123'})).status,200);assert.equal((await call(ca,'state')).status,401);
assert.equal((await call(cg,'state')).data.users.some(u=>u.id===b.id),false);
assert.ok(db.prepare('SELECT count(*) n FROM audit').get().n>5);
let {DatabaseSync}=require('node:sqlite'),second=new DatabaseSync(path.join(dir,'clube.sqlite'));assert.equal(second.prepare('SELECT count(*) n FROM orders').get().n,1);second.close();
}finally{await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true})}
});

