/**
 * The live dashboard page served at `/`. It polls `/api/run` once per second
 * and re-renders the active run: a gantt where running agents advance in real
 * time, a fan-out -> barrier -> reduce flow whose nodes change state live, and
 * telemetry. Self-contained, vanilla JS + SVG, no external requests.
 */

export function liveDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>wfviz — live workflow</title>
<style>${CSS}</style>
</head>
<body>
<main id="app">
  <div id="empty" class="empty">
    <div class="spinner"></div>
    <h1>Waiting for a workflow…</h1>
    <p>Start a dynamic workflow in Claude Code and it will appear here, live.</p>
  </div>
  <div id="dash" hidden></div>
</main>
<footer class="credit">live · <a href="https://github.com/democra-ai/claude-workflow-viz" rel="noopener noreferrer">claude-workflow-viz</a></footer>
<script>${CLIENT_JS}</script>
</body>
</html>
`;
}

const CSS = `
:root{
  --bg:#0a0e13;--panel:#0f151c;--panel2:#131b24;--line:#1f2a36;--ink:#cdd6e0;--mut:#7c8895;--dim:#525e6b;
  --teal:#2dd4bf;--green:#34d399;--amber:#f5b454;--red:#f87171;
  --p1:#5aa9ff;--p2:#f5b454;--p3:#34d399;--p4:#c084fc;--p5:#22d3ee;--p6:#fb7185;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.45;-webkit-font-smoothing:antialiased}
a{color:var(--teal);text-decoration:none}
#app{max-width:1180px;margin:0 auto;padding:26px 22px 8px;min-height:60vh}
.credit{max-width:1180px;margin:0 auto;padding:14px 22px 40px;color:var(--dim);font-size:12px;font-family:var(--mono)}
.empty{text-align:center;padding:14vh 20px;color:var(--mut)}
.empty h1{font-size:22px;color:var(--ink);font-weight:600;margin:18px 0 6px}
.empty p{font-size:14px;margin:0}
.spinner{width:34px;height:34px;border-radius:50%;border:3px solid var(--line);border-top-color:var(--teal);margin:0 auto;animation:spin 1s linear infinite}
.head{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px 14px;margin-bottom:4px}
.head h1{font-size:22px;font-weight:700;margin:0}
.pill{font-family:var(--mono);font-size:11px;padding:3px 10px;border-radius:999px;border:1px solid var(--line);display:inline-flex;align-items:center;gap:6px;color:var(--mut)}
.pill .dot{width:7px;height:7px;border-radius:50%}
.pill.live{color:var(--teal);border-color:#1c4b46}.pill.live .dot{background:var(--teal);animation:pulse 1.3s infinite}
.pill.done{color:var(--green)}.pill.done .dot{background:var(--green)}
.pill.err{color:var(--red)}.pill.err .dot{background:var(--red)}
.sub{color:var(--mut);font-family:var(--mono);font-size:12px;margin:2px 0 16px}
.chips{display:flex;flex-wrap:wrap;gap:9px;margin-bottom:16px}
.chip{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 13px;min-width:90px}
.chip b{display:block;font-size:17px;font-family:var(--mono);font-weight:700}
.chip span{font-size:10px;color:var(--mut);text-transform:uppercase;letter-spacing:.6px}
.chip.warn b{color:var(--amber)}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:14px}
.panel h2{font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:var(--mut);margin:0 0 12px}
svg{display:block;width:100%;height:auto;overflow:visible}
.gridline{stroke:var(--line);stroke-width:1}.axis{font-family:var(--mono);font-size:11px;fill:var(--mut)}
.lane{font-family:var(--mono);font-size:11px;fill:var(--mut)}
.barrier-line{stroke:var(--amber);stroke-width:1.3;stroke-dasharray:4 4;opacity:.7}
.barrier-txt{fill:var(--amber);font-family:var(--mono);font-size:10px}
.nowline{stroke:var(--teal);stroke-width:1.3;opacity:.8}
.concarea{fill:var(--teal);opacity:.12}.conctop{stroke:var(--teal);stroke-width:1.2;fill:none;opacity:.5}
.run-bar{animation:barpulse 1.4s ease-in-out infinite}
.flow{display:flex;flex-direction:column}
.band{border-left:2px solid var(--line);padding:9px 0 9px 16px}
.band .bt{font-family:var(--mono);font-size:12px;color:var(--mut);margin-bottom:8px}.band .bt b{color:var(--ink)}
.nodes{display:flex;flex-wrap:wrap;gap:8px}
.node{border:1px solid var(--line);background:var(--panel2);border-radius:9px;padding:7px 10px;font-family:var(--mono);font-size:11px;min-width:118px}
.node .nl{color:var(--ink);font-weight:600;display:block;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:210px}
.node .nm{color:var(--mut);font-size:10px;display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.node .st{width:7px;height:7px;border-radius:50%;display:inline-block}
.node.done{border-color:#1f5a44}.node.done .st{background:var(--green)}
.node.running{border-color:var(--teal);box-shadow:0 0 14px -4px var(--teal)}.node.running .st{background:var(--teal);animation:pulse 1.2s infinite}
.node.queued{opacity:.6}.node.queued .st{background:var(--dim)}
.node.error{border-color:var(--red)}.node.error .st{background:var(--red)}
.barrier-row{color:var(--amber);font-family:var(--mono);font-size:11px;padding:7px 0 7px 16px;border-left:2px solid var(--amber)}
.ingress,.egress{font-family:var(--mono);font-size:11px;color:var(--mut);padding:7px 0 7px 16px;border-left:2px solid #155e57}
.ingress b,.egress b{color:var(--teal)}
.logs{font-family:var(--mono);font-size:12px;color:var(--mut);display:flex;flex-direction:column;gap:5px}
.logs .lg::before{content:"▸ ";color:var(--teal)}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes barpulse{0%,100%{opacity:1}50%{opacity:.62}}
@media (prefers-reduced-motion:reduce){.spinner,.pill .dot,.node.running .st,.run-bar{animation:none}}
@media (max-width:680px){#app{padding:16px 12px}.head h1{font-size:18px}}
`;

const CLIENT_JS = `
"use strict";
(function(){
var PCOL=["var(--p1)","var(--p2)","var(--p3)","var(--p4)","var(--p5)","var(--p6)"];
function pcol(i){return PCOL[((i-1)%PCOL.length+PCOL.length)%PCOL.length];}
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;}
function S(t,a){var e=document.createElementNS("http://www.w3.org/2000/svg",t);for(var k in a){e.setAttribute(k,a[k]);}return e;}
function esc(s){s=(s==null?"":String(s));return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function fmtClock(ms){ms=Math.max(0,ms||0);var s=Math.round(ms/1000),m=Math.floor(s/60),r=s%60;return m+":"+(r<10?"0":"")+r;}
function fmtDur(ms){if(ms<1000)return Math.round(ms)+" ms";var s=ms/1000;if(s<90)return s.toFixed(1)+" s";var m=s/60;if(m<60)return m.toFixed(1)+" min";return Math.floor(m/60)+"h "+Math.round(m%60)+"m";}
function fmtNum(n){n=Math.round(n||0);var s=String(Math.abs(n)),o="";for(var i=0;i<s.length;i++){if(i>0&&(s.length-i)%3===0)o+=",";o+=s[i];}return (n<0?"-":"")+o;}
function fmtK(n){n=n||0;if(n<1000)return String(Math.round(n));if(n<1e6)return (n<1e4?(n/1e3).toFixed(1):Math.round(n/1e3))+"k";return (n/1e6).toFixed(1)+"M";}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

var emptyEl=document.getElementById("empty"), dashEl=document.getElementById("dash");
var lastRunId=null;

function render(p){
  var D=p.data, run=D.run, live=p.isRunning;
  var nowRel=live?Math.max(0,Date.now()-run.startTime):run.durationMs;
  var WIN=Math.max(1,D.windowMs,nowRel);

  var root=document.createElement("div");

  // header
  var head=el("div","head"); head.appendChild(el("h1",null,run.workflowName));
  var st=(run.status||"").toLowerCase();
  var cls=live?"live":(st.indexOf("err")>=0||st.indexOf("fail")>=0||st.indexOf("abort")>=0?"err":"done");
  var pill=el("span","pill "+cls); pill.appendChild(el("span","dot")); pill.appendChild(el("span",null,live?"running":run.status)); head.appendChild(pill);
  root.appendChild(head);
  var sub=el("div","sub"); sub.textContent=run.runId+"  ·  "+(run.defaultModel||"")+"  ·  "+(live?"elapsed ":"")+fmtClock(nowRel); root.appendChild(sub);

  // chips
  var done=D.agents.filter(function(a){return a.state==="done";}).length;
  var chips=el("div","chips");
  function chip(v,l,w){var c=el("div","chip"+(w?" warn":""));c.appendChild(el("b",null,v));c.appendChild(el("span",null,l));chips.appendChild(c);}
  chip(done+" / "+D.agents.length,"agents done");
  chip(fmtNum(run.totalToolCalls),"tool calls");
  chip(fmtNum(run.totalTokens),"tokens");
  chip("×"+D.peak+" / "+D.cap,"peak concurrency");
  if(D.retries>0)chip(String(D.retries),"retries",true);
  root.appendChild(chips);

  // gantt
  var gp=el("div","panel"); gp.appendChild(el("h2",null,"Timeline"));
  var rows=D.agents.slice().sort(function(a,b){return a.startRel-b.startRel||a.index-b.index;});
  var ROWH=24,PADT=8,CONCH=40,AXISH=20,W=1000,GH=Math.max(ROWH,rows.length*ROWH),H=PADT+CONCH+GH+AXISH;
  var svg=S("svg",{viewBox:"0 0 "+W+" "+H,role:"img","aria-label":"Live gantt of "+D.agents.length+" agents"});
  var plotL=170,plotR=W-14,plotW=plotR-plotL;
  function xOf(ms){return plotL+(clamp(ms,0,WIN)/WIN)*plotW;}
  var cBot=PADT+CONCH;
  for(var i=0;i<=6;i++){var tx=plotL+(i/6)*plotW;svg.appendChild(S("line",{class:"gridline",x1:tx,y1:PADT,x2:tx,y2:cBot+GH}));var tl=S("text",{class:"axis",x:tx,y:H-5,"text-anchor":i===0?"start":(i===6?"end":"middle")});tl.textContent=fmtClock((i/6)*WIN);svg.appendChild(tl);}
  // concurrency area
  var maxC=Math.max(D.peak,1),pts=[];
  (D.concurrency||[]).forEach(function(v,idx,arr){var x=plotL+(idx/Math.max(1,arr.length-1))*plotW;var y=cBot-(v/maxC)*(CONCH-8);pts.push(x.toFixed(1)+" "+y.toFixed(1));});
  if(pts.length){svg.appendChild(S("path",{class:"concarea",d:"M "+plotL+" "+cBot+" L "+pts.join(" L ")+" L "+plotR+" "+cBot+" Z"}));svg.appendChild(S("path",{class:"conctop",d:"M "+pts.join(" L ")}));}
  var cl=S("text",{class:"axis",x:plotL,y:PADT+10});cl.textContent="concurrency · peak ×"+D.peak;svg.appendChild(cl);
  // barriers
  D.phases.forEach(function(ph){if(ph.barrierAfter){var bx=xOf(ph.endRel);svg.appendChild(S("line",{class:"barrier-line",x1:bx,y1:cBot,x2:bx,y2:cBot+GH}));var t=S("text",{class:"barrier-txt",x:bx+3,y:cBot+11});t.textContent="barrier";svg.appendChild(t);}});
  // bars
  rows.forEach(function(a,r){var y=cBot+r*ROWH+3,h=ROWH-8;
    var lab=S("text",{class:"lane",x:8,y:y+h-2});lab.textContent=a.label.length>24?a.label.slice(0,23)+"…":a.label;svg.appendChild(lab);
    var endRel=(live&&a.state==="running")?nowRel:a.endRel;
    var x1=xOf(a.startRel),x2=Math.max(x1+3,xOf(endRel));
    var attrs={x:x1,y:y,width:(x2-x1),height:h,rx:3,fill:pcol(a.phaseIndex)};
    if(a.state==="queued")attrs["opacity"]="0.35";
    if(a.state==="error")attrs["stroke"]="var(--red)";
    var rect=S("rect",attrs);if(a.state==="running")rect.setAttribute("class","run-bar");svg.appendChild(rect);
  });
  // now line
  if(live){var nx=xOf(nowRel);svg.appendChild(S("line",{class:"nowline",x1:nx,y1:PADT,x2:nx,y2:cBot+GH}));}
  gp.appendChild(svg); root.appendChild(gp);

  // flow
  var fp=el("div","panel"); fp.appendChild(el("h2",null,"Flow · fan-out → barrier → reduce"));
  var flow=el("div","flow");
  var ing=el("div","ingress"); ing.innerHTML="prompt → <b>script.js</b>"; flow.appendChild(ing);
  D.phases.slice().sort(function(a,b){return a.index-b.index;}).forEach(function(ph){
    var band=el("div","band"); band.style.borderLeftColor=pcol(ph.index);
    var bt=el("div","bt"); bt.innerHTML="Phase "+ph.index+" · <b>"+esc(ph.title)+"</b>"; band.appendChild(bt);
    var nodes=el("div","nodes");
    D.agents.filter(function(a){return a.phaseIndex===ph.index;}).forEach(function(a){
      var n=el("div","node "+a.state); n.style.borderLeftColor=pcol(ph.index);
      var nl=el("span","nl",a.label);
      var nm=el("div","nm"); var dot=el("span","st"); nm.appendChild(dot);
      nm.appendChild(el("span",null,a.state));
      if(a.durationMs)nm.appendChild(el("span",null,fmtDur(a.durationMs)));
      if(a.tokens)nm.appendChild(el("span",null,fmtK(a.tokens)+" tok"));
      if(a.attempt>1)nm.appendChild(el("span",null,"×"+a.attempt));
      n.appendChild(nl); n.appendChild(nm); nodes.appendChild(n);
    });
    band.appendChild(nodes); flow.appendChild(band);
    if(ph.barrierAfter){var br=el("div","barrier-row");br.textContent="║ barrier — parallel() waits for all";flow.appendChild(br);}
  });
  var eg=el("div","egress"); eg.innerHTML=live?"<b>…</b> running":("<b>return</b> "+esc(run.resultDesc||"(value)")); flow.appendChild(eg);
  fp.appendChild(flow); root.appendChild(fp);

  // logs
  if(run.logs&&run.logs.length){var lp=el("div","panel");lp.appendChild(el("h2",null,"log()"));var lc=el("div","logs");run.logs.forEach(function(l){lc.appendChild(el("div","lg",l));});lp.appendChild(lc);root.appendChild(lp);}

  dashEl.innerHTML=""; dashEl.appendChild(root); dashEl.hidden=false; emptyEl.hidden=true;
}

function showEmpty(){dashEl.hidden=true;emptyEl.hidden=false;}

var failures=0;
function poll(){
  fetch("/api/run",{cache:"no-store"}).then(function(r){return r.json();}).then(function(p){
    failures=0;
    if(p&&p.ok&&p.data&&p.data.agents){lastRunId=p.runId;render(p);}else{showEmpty();}
  }).catch(function(){failures++;if(failures>3)showEmpty();});
}
poll();
setInterval(poll,1000);
})();
`;
