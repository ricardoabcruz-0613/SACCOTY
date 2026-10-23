import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const apiSource=source.slice(source.indexOf('async function api('),source.indexOf('\nasync function refresh'));
test('Interface explica resposta HTML no lugar de JSON',async()=>{
 let context=vm.createContext({fetch:async()=>new Response('<!DOCTYPE html><h1>Not found</h1>',{status:404,headers:{'Content-Type':'text/html'}}),csrf:'',login(){}});vm.runInContext(apiSource,context);
 await assert.rejects(vm.runInContext("api('state')",context),e=>e.name!=='SyntaxError'&&e.message.includes('serviço do site não foi publicado')&&e.status===404);
});
test('Interface distingue falha de conexão de rejeição do pedido',async()=>{
 let context=vm.createContext({fetch:async()=>{throw Error('offline')},csrf:'',login(){}});vm.runInContext(apiSource,context);
 await assert.rejects(vm.runInContext("api('order',{})",context),e=>e.uncertain===true);
});
