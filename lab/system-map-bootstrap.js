(function(){
  "use strict";
  const URL="https://api.atlas-systems.uk/v1/topology";
  const BLOCKED=new Set(["simple-proxy"]);
  let topologyPromise=fetch(URL,{cache:"no-store",headers:{Accept:"application/json"}}).then((r)=>{if(!r.ok)throw new Error(`topology ${r.status}`);return r.json();}).catch(()=>({components:[]}));
  let mounted=null;
  let first=true;
  let reloadPending=false;

  function cloneBase(){const t=window.ATLAS_TOPOLOGY||{nodes:[],edges:[],kv:[]};return{nodes:t.nodes.map((x)=>({...x})),edges:t.edges.map((x)=>({...x})),kv:t.kv.map((x)=>({...x}))};}
  function addNode(g,n){if(!n||!n.id||BLOCKED.has(n.id)||g.nodes.some((x)=>x.id===n.id))return;g.nodes.push(n);}
  function addEdge(g,e){const ids=new Set(g.nodes.map((x)=>x.id));if(!ids.has(e.from)||!ids.has(e.to)||BLOCKED.has(e.from)||BLOCKED.has(e.to))return;if(!g.edges.some((x)=>x.from===e.from&&x.to===e.to&&x.kind===e.kind))g.edges.push(e);}
  function role(c){if(c.kind==="worker")return"worker";if(c.kind==="site")return"site";return"infra";}
  function compile(doc,snap){
    const g=cloneBase();
    for(const c of doc.components||[]) addNode(g,{id:c.id,role:role(c),label:c.id,layer:c.layer||"reusable-kit",repo:c.repo||null,blurb:c.description||"",sourceOnly:c.kind==="tool"||c.kind==="github-actions"});
    for(const w of snap.workers||[]) addNode(g,{id:w.name,role:"worker",label:w.name,layer:"observability",blurb:w.meta?.description||"Discovered from the live Worker registry"});
    const ids=new Set(g.nodes.map((x)=>x.id));
    for(const c of doc.components||[]) for(const d of c.depends_on||[]) if(ids.has(c.id)&&ids.has(d)) addEdge(g,{from:c.id,to:d,kind:c.kind==="github-actions"||c.kind==="tool"?"poll":"http",label:"declared dependency",generated:true});
    g.nodes=g.nodes.filter((x)=>!BLOCKED.has(x.id)).sort((a,b)=>a.id.localeCompare(b.id));
    const visible=new Set(g.nodes.map((x)=>x.id));
    g.edges=g.edges.filter((x)=>visible.has(x.from)&&visible.has(x.to)).sort((a,b)=>`${a.from}|${a.to}|${a.kind}`.localeCompare(`${b.from}|${b.to}|${b.kind}`));
    g.kv=g.kv.filter((x)=>visible.has(x.parent)).sort((a,b)=>a.id.localeCompare(b.id));
    return g;
  }
  function fingerprint(g){return JSON.stringify({n:g.nodes.map((x)=>[x.id,x.role,x.layer||""]),e:g.edges.map((x)=>[x.from,x.to,x.kind]),k:g.kv.map((x)=>[x.id,x.parent])});}
  function mount(g){window.ATLAS_TOPOLOGY=g;mounted=fingerprint(g);const s=document.createElement("script");s.src="/lab/system-map.js?v=20260715-live-topology";s.defer=true;document.body.appendChild(s);}
  window.AtlasRegistry.subscribe(async(snap)=>{const doc=await topologyPromise;const g=compile(doc,snap);if(first){first=false;mount(g);return;}if(fingerprint(g)!==mounted&&!reloadPending){reloadPending=true;setTimeout(()=>window.location.reload(),250);}});
})();
