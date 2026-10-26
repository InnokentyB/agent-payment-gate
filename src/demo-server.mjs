import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes,timingSafeEqual} from 'node:crypto';
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8'};
export function createDemoServer({backend,port=3157,webRoot=new URL('../web/',import.meta.url)}){
 const csrf=randomBytes(32).toString('hex');
 const equal=s=>typeof s==='string'&&s.length===csrf.length&&timingSafeEqual(Buffer.from(s),Buffer.from(csrf));
 const hosts=new Set([`localhost:${port}`,`127.0.0.1:${port}`]);
 const server=createServer(async(req,res)=>{
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
  const send=(code,value)=>{res.writeHead(code,{...headers,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value))};
  try{
   if(port===0){hosts.add(`localhost:${server.address().port}`);hosts.add(`127.0.0.1:${server.address().port}`)}
   if(!hosts.has(req.headers.host)||req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){send(403,{error:'Open this demo through its localhost address.'});return}
   const path=new URL(req.url,`http://${req.headers.host}`).pathname;
   if(req.method==='GET'&&path==='/health'){send(200,{status:'ok',network:'testnet'});return}
   if(req.method==='GET'&&path==='/api/state'){res.setHeader('Set-Cookie',`demo_csrf=${csrf}; HttpOnly; SameSite=Strict; Path=/`);send(200,{...await backend.snapshot(),csrf});return}
   if(req.method==='POST'&&path.startsWith('/api/')){
    const cookie=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('demo_csrf='))?.slice(10);
    if(!equal(req.headers['x-demo-csrf'])||!equal(cookie)||req.headers.origin!==`http://${req.headers.host}`){send(403,{error:'Refresh the page before making a change.'});return}
    if(req.headers['content-type']!=='application/json'){send(415,{error:'JSON required'});return}
    let body='';for await(const part of req){body+=part;if(body.length>8192){send(413,{error:'Request too large'});return}}
    const input=JSON.parse(body||'{}');
    const job=await backend.action(path.slice(5),input);send(202,{job});return;
   }
   if(req.method==='GET'&&['/','/index.html','/app.css','/app.js'].includes(path)){
    const name=path==='/'?'index.html':path.slice(1);const data=await readFile(new URL(name,webRoot));res.writeHead(200,{...headers,'Content-Type':types[name.split('.').pop()]});res.end(data);return;
   }
   send(404,{error:'Not found'});
  }catch(e){send(e instanceof SyntaxError?400:409,{error:e.message==='Unknown action'?'Unknown action':e.message?.startsWith('Another action')?e.message:'Action unavailable. Refresh status and check the current permission.'})}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;return server;
}
