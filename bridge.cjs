const http = require('node:http');
const crypto = require('node:crypto');
const clean = value => String(value ?? '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
function createBridge({commandTimeout=12000}={}) {
  const token = crypto.randomBytes(24).toString('hex');
  let snapshot = null, lastSeen = 0, pending = null, lastError = null;
  const listeners=new Set();
  const reply = (res, status, body) => {
    if (res.destroyed || res.writableEnded) return;
    // Each launch replaces this server. Do not leave a pooled connection that
    // the extension could reuse after /quit has closed the previous process.
    res.writeHead(status, {'Content-Type':'application/json', 'Cache-Control':'no-store', 'Connection':'close'});
    res.end(JSON.stringify(body));
  };
  const server = http.createServer(async (req, res) => {
    if (req.headers.host !== `127.0.0.1:${server.address().port}`) return reply(res,403,{error:'host'});
    if (req.headers.authorization !== `Bearer ${token}`) return reply(res,401,{error:'pairing'});
    if (req.headers.origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(req.headers.origin)) return reply(res,403,{error:'origin'});
    // Validate pairing without consuming an outstanding browser command.
    if (req.method === 'GET' && req.url === '/health') return reply(res,200,{ok:true});
    if (req.method === 'GET' && req.url === '/poll') {
      lastSeen = Date.now();
      if (pending && !pending.delivered) {
        pending.delivered = true;
        return reply(res,200,pending.command);
      }
      // Always obtain fresh state; the extension waits between polls.
      return reply(res,200,{type:'snapshot'});
    }
    if (req.method !== 'POST' || req.url !== '/result') return reply(res,404,{error:'route'});
    let raw = '', size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 256 * 1024) { reply(res,413,{error:'size'}); req.destroy(); return; }
        raw += chunk.toString('utf8');
      }
      const body = JSON.parse(raw);
      lastSeen = Date.now();
      if(body.error)lastError=clean(body.error);
      if (body.snapshot && typeof body.snapshot === 'object') {
        const before=snapshot?.stream,next=body.snapshot.stream;
        const stale=before&&next&&(next.startedAt<before.startedAt||next.id===before.id&&next.revision<=before.revision);
        if(!stale){
          snapshot=body.snapshot;lastError=null;
          for(const listener of listeners){try{listener(snapshot);}catch{}}
        }
      }
      if (pending && body.id === pending.command.id) {
        clearTimeout(pending.timer);
        const current = pending;
        pending = null;
        if (body.error) current.reject(new Error(clean(body.error)));
        else current.resolve(body);
      }
      reply(res,200,{ok:true});
    } catch { reply(res,400,{error:'invalid JSON'}); }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return {
    token, server,
    get snapshot(){return snapshot;},
    get lastError(){return lastError;},
    get connected(){return Date.now()-lastSeen < 10000;},
    onSnapshot(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    async listen(port=17361){ await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);}); return server.address().port; },
    command(type, payload={}) {
      if (pending) return Promise.reject(new Error('前一個操作尚未完成'));
      if (!this.connected) return Promise.reject(new Error('擴充套件尚未連線，請在 Instagram 分頁點選擴充套件配對'));
      return new Promise((resolve,reject)=>{
        pending={command:{...payload,type,id:crypto.randomUUID()},delivered:false,resolve,reject};
        pending.timer=setTimeout(()=>{pending=null;reject(new Error('操作逾時，狀態不明；請查看網頁，程式不會自動重送。'));},commandTimeout);
      });
    },
    close(){ if(pending){clearTimeout(pending.timer);pending.reject(new Error('已停止'));pending=null;} listeners.clear();server.closeAllConnections();server.close(); snapshot=null; }
  };
}
module.exports={createBridge,clean};
