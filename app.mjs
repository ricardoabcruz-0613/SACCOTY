import {randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback),now=()=>new Date().toISOString();
const digest=v=>createHash('sha256').update(v).digest('hex');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const text=(v,max=160)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail(400,'Preencha os campos corretamente.');return v.trim()};
const integer=(v,min=0,max=1000000)=>{if(!Number.isSafeInteger(v)||v<min||v>max)fail(400,'Quantidade inválida.');return v};
const mail=v=>{v=text(v,200).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))fail(400,'E-mail inválido.');return v};
function password(v){if(typeof v!=='string'||v.length<12||v.length>128)fail(400,'Use uma senha de 12 a 128 caracteres.');return v}
export async function hash(v){let salt=randomBytes(16).toString('hex');return salt+':'+Buffer.from(await scrypt(password(v),salt,64)).toString('hex')}
async function verify(v,h){if(typeof v!=='string'||v.length>128)return false;let [salt,key]=h.split(':');let actual=Buffer.from(await scrypt(v,salt,64));return timingSafeEqual(actual,Buffer.from(key,'hex'))}
const dummySalt='b76f0e56bc9241dd2c45a50c5b5d1178',dummyHash=dummySalt+':'+('00'.repeat(64));
function admin(u){if(u.role!=='Administrador')fail(403,'Acesso restrito ao administrador.')}
function pub(u){return {id:u.id,name:u.name,email:u.email,role:u.role,team:u.team,active:u.active,balance:Number(u.balance)}}
const q=(client)=>({all:async(sql,...args)=>(await client.query(sql,args)).rows,one:async(sql,...args)=>(await client.query(sql,args)).rows[0],run:async(sql,...args)=>client.query(sql,args)});
async function transaction(pool,fn){let c=await pool.connect();try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='8s'");await c.query('SELECT id FROM app_lock WHERE id=1 FOR UPDATE');let result=await fn(q(c));await c.query('COMMIT');return result}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}}
async function limited(pool,key,max){let {rows}=await pool.query(`INSERT INTO attempts(key,count,expires) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN attempts.expires<$3 THEN 1 ELSE attempts.count+1 END, expires=CASE WHEN attempts.expires<$3 THEN EXCLUDED.expires ELSE attempts.expires END RETURNING count`,[digest(key),Date.now()+900000,Date.now()]);if(rows[0].count>max)fail(429,'Muitas tentativas. Aguarde 15 minutos.')}
function image(value){if(!value)return undefined;if(typeof value!=='string'||value.length>1400000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value))fail(400,'Use uma imagem PNG, JPG ou WebP de até 1 MB.');let b=Buffer.from(value.split(',')[1],'base64'),mime=value.slice(5,value.indexOf(';'));if(b.length>1048576||!(mime==='image/png'&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||mime==='image/jpeg'&&b[0]===255&&b[1]===216&&b[2]===255||mime==='image/webp'&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'))fail(400,'Conteúdo da imagem inválido.');return value}
export function createHandler({getPool,env=process.env,log=console.error}){
 return async function handle(request,context={}){
  const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  try{
   const origin=env.PUBLIC_ORIGIN||env.URL;
   if(!origin)fail(503,'Defina PUBLIC_ORIGIN no painel do Netlify.');
   const expected=new URL(origin).origin,url=new URL(request.url),endpoint=url.pathname;
   if(url.origin!==expected)fail(403,'Endereço de acesso não autorizado.');
   if(!['GET','POST'].includes(request.method))fail(405,'Método não permitido.');
   if(request.method==='POST'&&(request.headers.get('origin')!==expected||!request.headers.get('content-type')?.startsWith('application/json')))fail(403,'Origem da solicitação inválida.');
   let b={};
   if(request.method==='POST'){
    if(Number(request.headers.get('content-length'))>1500000)fail(413,'Arquivo ou solicitação muito grande.');
    const reader=request.body?.getReader();let chunks=[],length=0;
    if(reader)while(true){let {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>1500000){await reader.cancel();fail(413,'Arquivo ou solicitação muito grande.')}chunks.push(Buffer.from(value))}
    try{b=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!b||typeof b!=='object'||Array.isArray(b))throw Error()}catch{fail(400,'Solicitação inválida.')}
   }
   const pool=getPool();
   const cookie=(value,clear=false)=>headers.set('Set-Cookie','sid='+value+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age='+(clear?0:28800));
   const ip=context.ip||'unknown';
   if(request.method==='POST'&&['/api/login','/api/register','/api/setup'].includes(endpoint)){
    await limited(pool,'ip:'+ip,60);
    if(endpoint==='/api/login')await limited(pool,'login:'+mail(b.email),10);
    else await limited(pool,endpoint+':'+ip,10);
   }
   const result=await transaction(pool,async db=>{
    const audit=async(u,action,detail)=>db.run('INSERT INTO audit(date,actor,action,detail) VALUES($1,$2,$3,$4)',now(),u?.id||null,action,JSON.stringify(detail));
    if(request.method==='POST'&&endpoint==='/api/setup'){
     if(!env.SETUP_KEY||env.SETUP_KEY.length<32)fail(503,'Defina SETUP_KEY com pelo menos 32 caracteres no Netlify.');
     if(typeof b.key!=='string'||b.key.length>256||!timingSafeEqual(Buffer.from(digest(b.key)),Buffer.from(digest(env.SETUP_KEY))))fail(403,'Chave de configuração incorreta.');
     if(await db.one('SELECT id FROM users LIMIT 1'))fail(409,'A configuração inicial já foi concluída.');
     let name=text(b.name,80),email=mail(b.email),pass=await hash(b.password);
     const u=await db.one("INSERT INTO users(name,email,password,role,active) VALUES($1,$2,$3,'Administrador',TRUE) RETURNING id",name,email,pass);
     await audit(u,'configuracao-inicial',{});return {ok:true};
    }
    if(request.method==='POST'&&endpoint==='/api/register'){
     if(!await db.one("SELECT id FROM users WHERE role='Administrador' AND active=TRUE LIMIT 1"))fail(428,'O administrador precisa concluir a configuração inicial.');
     let name=text(b.name,80),email=mail(b.email),pass=await hash(b.password);
     if(env.ALLOWED_EMAIL_DOMAIN&&email.split('@')[1]!==env.ALLOWED_EMAIL_DOMAIN.toLowerCase())fail(400,'Utilize o e-mail corporativo autorizado.');
     if(await db.one('SELECT id FROM users WHERE email=$1',email))fail(409,'Não foi possível cadastrar este e-mail. Consulte o administrador.');
     await db.run("INSERT INTO users(name,email,password,role) VALUES($1,$2,$3,'Colaborador')",name,email,pass);await audit(null,'cadastro-pendente',{email});return {ok:true};
    }
    if(request.method==='POST'&&endpoint==='/api/login'){
     let email=mail(b.email),u=await db.one('SELECT * FROM users WHERE email=$1',email);
     if(!await verify(b.password,u?.password||dummyHash)||!u?.active)fail(401,'E-mail ou senha inválidos, ou cadastro ainda não aprovado.');
     let token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
     await db.run('DELETE FROM sessions WHERE expires<$1',Date.now());await db.run('DELETE FROM attempts WHERE expires<$1',Date.now());
     await db.run('INSERT INTO sessions(token,uid,expires,csrf) VALUES($1,$2,$3,$4)',digest(token),u.id,Date.now()+28800000,csrf);await audit(u,'login',{});cookie(token);return {ok:true};
    }
    let token=request.headers.get('cookie')?.match(/(?:^|;\s*)sid=([a-f0-9]{64})(?:;|$)/)?.[1];
    let session=token&&await db.one('SELECT * FROM sessions WHERE token=$1 AND expires>$2',digest(token),Date.now());
    let u=session&&await db.one('SELECT * FROM users WHERE id=$1 AND active=TRUE',session.uid);
    if(!u)fail(401,'Entre na sua conta.');
    if(request.method==='GET'&&/^\/api\/image\/[1-9][0-9]*$/.test(endpoint)){
     let row=await db.one('SELECT data FROM products WHERE id=$1',integer(Number(endpoint.split('/').pop()),1));
     if(!row?.data.image)fail(404,'Imagem não encontrada.');let img=row.data.image;
     let imageHeaders=new Headers(headers);imageHeaders.set('Content-Type',img.slice(5,img.indexOf(';')));
     return new Response(Buffer.from(img.split(',')[1],'base64'),{headers:imageHeaders});
    }
    if(request.method==='GET'&&endpoint==='/api/state'){
     let users=u.role==='Administrador'?await db.all('SELECT * FROM users ORDER BY id'):u.role==='Gestor'?await db.all("SELECT * FROM users WHERE id=$1 OR (team=$2 AND team<>'' AND role='Colaborador' AND active=TRUE) ORDER BY id",u.id,u.team):[u];
     let orders=u.role==='Administrador'?await db.all('SELECT * FROM orders ORDER BY id DESC'):await db.all('SELECT * FROM orders WHERE uid=$1 ORDER BY id DESC',u.id);
     let ledger=await db.all('SELECT * FROM ledger WHERE uid=ANY($1::integer[]) ORDER BY id DESC',users.map(x=>x.id));
     return {me:u.id,csrf:session.csrf,users:users.map(pub),products:(await db.all('SELECT * FROM products ORDER BY id')).map(p=>({...p.data,id:p.id,image:p.data.image?'/api/image/'+p.id:undefined})),orders:orders.map(o=>({...o.data,id:o.id,uid:o.uid})),ledger:ledger.map(l=>({...l,amount:Number(l.amount)}))};
    }
    if(request.method!=='POST')fail(404,'Recurso não encontrado.');
    if(request.headers.get('x-csrf-token')!==session.csrf)fail(403,'Sessão inválida. Atualize a página.');
    if(endpoint==='/api/logout'){await db.run('DELETE FROM sessions WHERE token=$1',session.token);cookie('',true);return {ok:true}}
    if(endpoint==='/api/password'){
     if(!await verify(b.current,u.password))fail(400,'Senha atual incorreta.');
     await db.run('UPDATE users SET password=$1 WHERE id=$2',await hash(b.password),u.id);await db.run('DELETE FROM sessions WHERE uid=$1',u.id);await audit(u,'alterar-senha',{});cookie('',true);return {ok:true};
    }
    if(endpoint==='/api/credit'){
     if(!['Administrador','Gestor'].includes(u.role))fail(403,'Sem permissão.');
     let target=await db.one('SELECT * FROM users WHERE id=$1',integer(b.uid,1)),amount=integer(b.amount,1,100000),reason=text(b.reason),key=text(b.request,100);
     if(!target?.active)fail(400,'Colaborador indisponível.');
     if(u.role==='Gestor'&&(!u.team||target.team!==u.team||target.role!=='Colaborador'||target.id===u.id))fail(403,'Você só pode creditar colaboradores do seu time.');
     let old=await db.one('SELECT * FROM ledger WHERE request=$1',key);
     if(old){if(old.actor!==u.id||old.uid!==target.id||Number(old.amount)!==amount||old.reason!==reason)fail(409,'Identificador já utilizado.');return {ok:true}}
     if(Number(target.balance)+amount>9000000000000)fail(400,'Limite de saldo atingido.');
     await db.run('UPDATE users SET balance=balance+$1 WHERE id=$2',amount,target.id);
     await db.run('INSERT INTO ledger(uid,amount,reason,date,by,request,actor) VALUES($1,$2,$3,$4,$5,$6,$7)',target.id,amount,reason,now(),u.name,key,u.id);
     await audit(u,'credito',{uid:target.id,amount,reason});return {ok:true};
    }
    if(endpoint==='/api/product'){
     admin(u);let previous=b.id?await db.one('SELECT data FROM products WHERE id=$1',integer(b.id,1)):null;
     let photo=previous&&b.image==='/api/image/'+b.id?previous.data.image:image(b.image);
     let data={name:text(b.name,80),description:text(b.description,180),category:text(b.category,40),price:integer(b.price,1),stock:integer(b.stock),image:photo,emoji:'🎁',color:'#edf2fa'};
     if(b.id){if(!await db.one('SELECT id FROM products WHERE id=$1',integer(b.id,1)))fail(404,'Produto não encontrado.');await db.run('UPDATE products SET data=$1 WHERE id=$2',JSON.stringify(data),b.id)}else await db.run('INSERT INTO products(data) VALUES($1)',JSON.stringify(data));
     await audit(u,'salvar-produto',{id:b.id||null,name:data.name,price:data.price,stock:data.stock});return {ok:true};
    }
    if(endpoint==='/api/order'){
     let key=text(b.request,100),old=await db.one('SELECT * FROM orders WHERE request=$1',key);
     if(old){if(old.uid!==u.id)fail(409,'Identificador já utilizado.');return {id:old.id}}
     if(!Array.isArray(b.items)||!b.items.length||b.items.length>100)fail(400,'Sacola inválida.');
     let ids=new Set(),items=[],total=0;
     for(let item of b.items){
      let id=integer(item.id,1),qty=integer(item.qty,1,1000);if(ids.has(id))fail(400,'Produto repetido.');ids.add(id);
      let row=await db.one('SELECT * FROM products WHERE id=$1',id);if(!row)fail(409,'Produto indisponível.');let p=row.data;
      if(p.stock<qty)fail(409,'Estoque insuficiente. Atualize sua sacola.');if(item.price!==p.price)fail(409,'O valor de um produto mudou. Confira a sacola novamente.');
      total+=p.price*qty;items.push({id,name:p.name,price:p.price,qty});p.stock-=qty;await db.run('UPDATE products SET data=$1 WHERE id=$2',JSON.stringify(p),id);
     }
     if(total>Number(u.balance))fail(409,'Saldo insuficiente.');
     await db.run('UPDATE users SET balance=balance-$1 WHERE id=$2',total,u.id);
     let o=await db.one('INSERT INTO orders(uid,request,data) VALUES($1,$2,$3) RETURNING id',u.id,key,JSON.stringify({date:now(),status:'Solicitado',total,items}));
     await db.run('INSERT INTO ledger(uid,amount,reason,date,by,actor) VALUES($1,$2,$3,$4,$5,$6)',u.id,-total,'Resgate #'+o.id,now(),u.name,u.id);await audit(u,'resgate',{id:o.id,total});return {id:o.id};
    }
    if(endpoint==='/api/order-status'){
     admin(u);let row=await db.one('SELECT * FROM orders WHERE id=$1',integer(b.id,1));if(!row)fail(404,'Pedido não encontrado.');let o=row.data;
     if(o.status===b.status)return {ok:true};let transitions={'Solicitado':['Pronto para retirada','Cancelado'],'Pronto para retirada':['Entregue','Cancelado']};if(!transitions[o.status]?.includes(b.status))fail(409,'Transição de pedido inválida.');
     if(b.status==='Cancelado'){
      await db.run('UPDATE users SET balance=balance+$1 WHERE id=$2',o.total,row.uid);
      for(let i of o.items){let p=(await db.one('SELECT data FROM products WHERE id=$1',i.id)).data;p.stock+=i.qty;await db.run('UPDATE products SET data=$1 WHERE id=$2',JSON.stringify(p),i.id)}
      await db.run('INSERT INTO ledger(uid,amount,reason,date,by,actor) VALUES($1,$2,$3,$4,$5,$6)',row.uid,o.total,'Estorno do pedido #'+row.id,now(),u.name,u.id);
     }
     o.status=b.status;await db.run('UPDATE orders SET data=$1 WHERE id=$2',JSON.stringify(o),row.id);await audit(u,'status-pedido',{id:row.id,status:b.status});return {ok:true};
    }
    if(endpoint==='/api/user'){
     admin(u);let target=await db.one('SELECT * FROM users WHERE id=$1',integer(b.id,1));if(!target)fail(404,'Conta não encontrada.');if(target.id===u.id)fail(400,'Use outra conta administrativa para alterar seu perfil.');
     if(!['Colaborador','Gestor','Administrador'].includes(b.role)||typeof b.active!=='boolean'||typeof b.team!=='string'||b.team.length>80)fail(400,'Perfil inválido.');
     if(target.role==='Administrador'&&(!b.active||b.role!=='Administrador')&&Number((await db.one("SELECT count(*) n FROM users WHERE active=TRUE AND role='Administrador'")).n)<=1)fail(400,'Mantenha um administrador ativo.');
     await db.run('UPDATE users SET role=$1,active=$2,team=$3 WHERE id=$4',b.role,b.active,b.team.trim(),target.id);await db.run('DELETE FROM sessions WHERE uid=$1',target.id);await audit(u,'alterar-conta',{id:target.id,role:b.role,active:b.active,team:b.team});return {ok:true};
    }
    if(endpoint==='/api/reset-password'){
     admin(u);let id=integer(b.id,1);if(id===u.id)fail(400,'Use a opção Minha senha.');if(!await db.one('SELECT id FROM users WHERE id=$1',id))fail(404,'Conta não encontrada.');
     await db.run('UPDATE users SET password=$1 WHERE id=$2',await hash(b.password),id);await db.run('DELETE FROM sessions WHERE uid=$1',id);await audit(u,'redefinir-senha',{id});return {ok:true};
    }
    fail(404,'Recurso não encontrado.');
   });
   if(result instanceof Response)return result;
   return new Response(JSON.stringify(result),{status:200,headers});
  }catch(e){
   headers.delete('Set-Cookie');let status=e.status||(['42P01','3D000','ECONNREFUSED','ENOTFOUND','ENETUNREACH'].includes(e.code)?503:500);
   if(!e.status)log('Falha na API: '+(e.code||e.name));
   let message=e.status?e.message:status===503?'Banco indisponível ou migração pendente. Confira Data & Storage e o log do deploy no Netlify.':'Não foi possível concluir. Tente novamente ou consulte o administrador.';
   return new Response(JSON.stringify({error:message}),{status,headers});
  }
 };
}
