import {isIP} from 'node:net';
import {timingSafeEqual} from 'node:crypto';
import {createServer,request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {createReadStream,statSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Fixed deployment upstream, never a browser-supplied proxy destination.
// Serves the built H5 app and proxies only the configured sync API.
const secretEqual=(a,b)=>typeof a==='string'&&b.length>=32&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function createWebServer({gatewayKey=process.env.HH_GATEWAY_KEY??'',edgeKey=process.env.HH_EDGE_KEY??'',upstream=process.env.SYNC_SERVER_URL??'http://127.0.0.1:4318',dist=resolve(fileURLToPath(new URL('../dist',import.meta.url)))}={}){
  if((gatewayKey&&gatewayKey.length<32)||(edgeKey&&edgeKey.length<32))throw Error('Internal proxy keys must contain at least 32 characters');
  const target=new URL(upstream);
  if(!['http:','https:'].includes(target.protocol)||target.username||target.password||target.search||target.hash||target.pathname!=='/')throw new Error('SYNC_SERVER_URL must be an HTTP(S) origin without credentials or paths');
  const root=resolve(dist),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.txt':'text/plain; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};
  const server=createServer((req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    const fail=(status,message)=>{if(res.headersSent){res.destroy();return;}res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:{code:'WEB_GATEWAY',message}}));};
    let url;try{url=new URL(req.url,'http://localhost');}catch{return fail(400,'请求地址无效');}
    if(url.pathname.startsWith('/api/v1/')||url.pathname==='/healthz'){
      if(!['GET','POST'].includes(req.method))return fail(405,'不支持的请求方法');
      const forwarded=req.headers['x-hh-edge-ip'];
      const ip=secretEqual(req.headers['x-hh-edge-key'],edgeKey)&&typeof forwarded==='string'&&isIP(forwarded)?forwarded:req.socket.remoteAddress;
      const headers={'X-HH-Gateway-Key':gatewayKey,'X-HH-Client-IP':ip,'Accept':'application/json',...(req.headers.authorization?{Authorization:req.headers.authorization}:{}),...(req.headers['content-type']?{'Content-Type':req.headers['content-type']}:{}),...(req.headers['content-length']?{'Content-Length':req.headers['content-length']}:{})};
      const proxy=(target.protocol==='https:'?httpsRequest:httpRequest)(new URL(url.pathname+url.search,target),{method:req.method,headers,timeout:25000},response=>{
        res.writeHead(response.statusCode??502,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(response.headers['retry-after']?{'Retry-After':response.headers['retry-after']}:{})});response.pipe(res);
      });
      proxy.on('timeout',()=>proxy.destroy(new Error('timeout')));proxy.on('error',()=>fail(502,'无法连接家庭服务，请检查服务器连接配置或稍后重试。'));
      req.on('aborted',()=>proxy.destroy());req.pipe(proxy);return;
    }
    if(url.pathname.startsWith('/api/'))return fail(410,'旧版数据接口已停用，请使用家庭同步接口。');
    if(!['GET','HEAD'].includes(req.method))return fail(405,'不支持的请求方法');
    let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return fail(400,'请求地址无效');}
    if(pathname.split('/').some(segment=>segment.startsWith('.')))return fail(404,'文件不存在');
    let file=resolve(root,'.'+pathname);if(!file.startsWith(root+sep)&&file!==root)return fail(404,'文件不存在');
    if(!extname(pathname))file=resolve(root,'index.html');
    const type=types[extname(file)];if(!type)return fail(404,'文件不存在');
    try{const stat=statSync(file);if(!stat.isFile())return fail(404,'文件不存在');res.writeHead(200,{'Content-Type':type,'Content-Length':stat.size,'Cache-Control':extname(file)==='.html'?'no-cache':'public, max-age=3600'});if(req.method==='HEAD')return res.end();createReadStream(file).on('error',()=>res.destroy()).pipe(res);}
    catch{fail(404,'文件不存在');}
  });
  server.headersTimeout=10000;server.requestTimeout=30000;server.maxRequestsPerSocket=1000;return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const server=createWebServer();server.listen(Number(process.env.PORT??4000),process.env.HOST??'0.0.0.0',()=>console.log('Habit Hero H5 3.2.0 ready'));
  const stop=()=>server.close(()=>process.exit(0));process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
