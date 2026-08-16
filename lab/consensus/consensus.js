import "../shared/shell.js";

import {
  MODE_EVENTUAL,
  MODE_QUORUM,
  NETWORK_CLEAN,
  NETWORK_ISOLATE_C,
  NETWORK_SLOW_B,
  acknowledgementCount,
  advanceConsensus,
  agreementCount,
  beginWrite,
  canBeginWrite,
  committedAgreementCount,
  createConsensusState,
  localReplicaView,
  logWindow,
  messageProgress,
  networkLabel,
  nextWriteValue,
  nodePhase,
  setMode,
  setNetwork,
} from "./consensus-core.js";

const instrument = document.querySelector(".consensus-instrument");
const field = document.querySelector("#consensus-field");
const canvas = document.querySelector("#consensus-canvas");
const context = canvas.getContext("2d", { alpha: true });
const writeButton = document.querySelector("#consensus-write");
const resetButton = document.querySelector("#consensus-reset");
const nextValueOutput = document.querySelector("#consensus-next-value");
const truth = document.querySelector("#consensus-truth");
const quorumRing = document.querySelector("#consensus-quorum-ring");
const commitValue = document.querySelector("#consensus-commit-value");
const commitVersion = document.querySelector("#consensus-commit-version");
const agreementCountOutput = document.querySelector("#consensus-agreement-count");
const quorumState = document.querySelector("#consensus-quorum-state");
const acceptedValue = document.querySelector("#consensus-accepted-value");
const acceptedVersion = document.querySelector("#consensus-accepted-version");
const convergedValue = document.querySelector("#consensus-converged-value");
const convergedVersion = document.querySelector("#consensus-converged-version");
const writeStatus = document.querySelector("#consensus-write-status");
const acksOutput = document.querySelector("#consensus-acks");
const agreementOutput = document.querySelector("#consensus-agreement");
const networkOutput = document.querySelector("#consensus-network");
const policyOutput = document.querySelector("#consensus-policy");
const linkBOutput = document.querySelector("#consensus-link-b");
const linkCOutput = document.querySelector("#consensus-link-c");
const promptOutput = document.querySelector("#consensus-prompt");
const stateSummary = document.querySelector("#consensus-state-summary");
const modeButtons = [...document.querySelectorAll("button[data-mode]")];
const networkButtons = [...document.querySelectorAll("button[data-network]")];
const replicaElements = Object.fromEntries(["A", "B", "C"].map((id) => [id, document.querySelector(`[data-replica="${id}"]`)]));
const valueOutputs = Object.fromEntries(["A", "B", "C"].map((id) => [id, document.querySelector(`[data-node-value="${id}"]`)]));
const versionOutputs = Object.fromEntries(["A", "B", "C"].map((id) => [id, document.querySelector(`[data-node-version="${id}"]`)]));
const phaseOutputs = Object.fromEntries(["A", "B", "C"].map((id) => [id, document.querySelector(`[data-node-phase="${id}"]`)]));
const logOutputs = Object.fromEntries(["A", "B", "C"].map((id) => [id, document.querySelector(`[data-node-log="${id}"]`)]));
const localViews = Object.fromEntries(["A", "B", "C"].map((id) => [id, document.querySelector(`[data-local-view="${id}"]`)]));
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let state = createConsensusState();
let lastTimestamp = 0;
let lastAnnouncedKey = "";
let frameHandle = 0;
let focusedReplica = null;

function upperPhase(phase) {
  const labels = { synced:"SYNCED", proposal:"PROPOSAL", acked:"ACKED", accepted:"ACCEPTED", stale:"STALE", delayed:"DELAYED", isolated:"ISOLATED" };
  return labels[phase] || phase.toUpperCase();
}

function writeLabel() {
  if (!state.write) return "READY";
  if (state.write.status === "proposing") return `PROPOSE / ${acknowledgementCount(state)} ACK`;
  if (state.write.status === "accepted") return "ACCEPTED / SYNCING";
  if (state.write.status === "committed") return "COMMIT LOCKED";
  return "CONVERGED";
}

function promptForState() {
  if (state.network === NETWORK_ISOLATE_C) {
    return state.mode === MODE_QUORUM
      ? "Write with C isolated. A and B can lock committed truth while C keeps an older local value. Return to Clean and watch reconciliation cross the restored link."
      : "Write with C isolated. Latest accepted state advances immediately, while fully converged truth remains behind until C rejoins.";
  }
  if (state.network === NETWORK_SLOW_B) {
    return state.mode === MODE_QUORUM
      ? "Write with B slow. C can return the decisive acknowledgement first, so commit locks while B is visibly one phase behind."
      : "Write with B slow. Latest accepted truth advances first; the converged value stays behind until B receives and acknowledges the proposal.";
  }
  if (state.mode === MODE_EVENTUAL) {
    return "Write once in Eventual mode. The centre splits into latest accepted and fully converged truth until both followers catch up.";
  }
  return "Isolate C, then write. A and B can still commit through quorum while C keeps an older local truth. Heal the link and watch C catch up before phase coherence returns.";
}

function updateControls() {
  for (const button of modeButtons) button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode));
  for (const button of networkButtons) button.setAttribute("aria-pressed", String(button.dataset.network === state.network));
  const idle = canBeginWrite(state);
  writeButton.disabled = !idle;
  for (const button of modeButtons) button.disabled = !idle;
  nextValueOutput.textContent = nextWriteValue(state);
}

function renderLog(id) {
  const output = logOutputs[id];
  const entries = logWindow(state, id, 5);
  output.replaceChildren(...entries.map((entry) => {
    const marker = document.createElement("i");
    marker.dataset.state = entry.status;
    marker.title = `v${entry.version} ${entry.status}`;
    return marker;
  }));
}

function updateLocalView(id) {
  const view = localViews[id];
  const data = localReplicaView(state, id);
  view.hidden = focusedReplica !== id;
  view.querySelector("[data-local-value]").textContent = `${data.localValue} / v${data.localVersion}`;
  view.querySelector("[data-local-committed]").textContent = `${data.committedValue} / v${data.committedVersion}`;
  view.querySelector("[data-local-lag]").textContent = `${data.lag} ${data.lag === 1 ? "VERSION" : "VERSIONS"}`;
  view.querySelector("[data-local-link]").textContent = upperPhase(data.phase);
}

function updateReplica(id) {
  const node = state.nodes[id];
  const phase = nodePhase(state, id);
  const element = replicaElements[id];
  element.dataset.phase = phase;
  element.dataset.focused = String(focusedReplica === id);
  valueOutputs[id].textContent = node.value;
  versionOutputs[id].textContent = `v${node.version}`;
  phaseOutputs[id].textContent = upperPhase(phase);
  element.setAttribute("aria-label", `Replica ${id}, ${id === "A" ? "leader" : "follower"}. Local ${node.value} version ${node.version}. ${upperPhase(phase)}. Select for local state.`);
  renderLog(id);
  updateLocalView(id);
}

function updateTruth() {
  const acks = acknowledgementCount(state);
  const latestAgreement = agreementCount(state, state.nodes.A.version);
  const committedAgreement = committedAgreementCount(state);
  const pendingQuorum = state.mode === MODE_QUORUM && state.write?.status === "proposing";
  const recentLock = state.committedVersion > 0 && state.now - state.committedAt < 640;
  const recentConvergence = state.convergedVersion > 0 && state.now - state.convergedAt < 850;

  truth.dataset.phase = pendingQuorum ? "pending" : committedAgreement < 3 ? "partial" : "full";
  truth.dataset.lock = String(recentLock);
  truth.dataset.converged = String(recentConvergence);
  quorumRing.style.setProperty("--ack-angle", `${Math.max(0, Math.min(3, acks)) * 120}deg`);

  commitValue.textContent = state.committedValue;
  commitVersion.textContent = `VERSION ${state.committedVersion}`;
  agreementCountOutput.textContent = `${committedAgreement} / 3 AGREE`;
  if (!state.write) quorumState.textContent = "READY FOR PROPOSAL";
  else if (pendingQuorum) quorumState.textContent = `${acks} / 3 ACKNOWLEDGED`;
  else if (state.write.status === "committed") quorumState.textContent = "COMMITTED / CONVERGING";
  else quorumState.textContent = "CLUSTER CONVERGED";

  acceptedValue.textContent = state.acceptedValue;
  acceptedVersion.textContent = `VERSION ${state.acceptedVersion}`;
  convergedValue.textContent = state.convergedValue;
  convergedVersion.textContent = `VERSION ${state.convergedVersion}`;

  return latestAgreement;
}

function updateReadouts() {
  const latestAgreement = updateTruth();
  const isSplit = latestAgreement < 3;
  instrument.dataset.mode = state.mode;
  instrument.dataset.network = state.network;
  instrument.dataset.agreement = isSplit ? "split" : "full";
  instrument.dataset.write = state.write?.status || "idle";

  writeStatus.textContent = writeLabel();
  acksOutput.textContent = state.write ? `${acknowledgementCount(state)} / 3` : "3 / 3";
  agreementOutput.textContent = isSplit ? "SPLIT" : "FULL";
  networkOutput.textContent = networkLabel(state.network).toUpperCase();
  policyOutput.textContent = state.mode === MODE_QUORUM ? "QUORUM 2 / 3" : "EVENTUAL";
  promptOutput.textContent = promptForState();

  if (state.network === NETWORK_SLOW_B) {
    linkBOutput.textContent = "2.86 s";
    linkCOutput.textContent = "820 ms";
  } else if (state.network === NETWORK_ISOLATE_C) {
    linkBOutput.textContent = "680 ms";
    linkCOutput.textContent = "NO LINK";
  } else {
    linkBOutput.textContent = "680 ms";
    linkCOutput.textContent = "940 ms";
  }
}

function announceState() {
  const key = [state.mode,state.network,state.acceptedVersion,state.committedVersion,state.convergedVersion,state.nodes.B.version,state.nodes.C.version,state.write?.status || "idle"].join(":");
  if (key === lastAnnouncedKey) return;
  lastAnnouncedKey = key;
  const replicas = ["A","B","C"].map((id) => `Replica ${id} ${state.nodes[id].value} version ${state.nodes[id].version}, ${upperPhase(nodePhase(state,id)).toLowerCase()}`).join(". ");
  stateSummary.textContent = `Latest accepted ${state.acceptedValue} version ${state.acceptedVersion}. Committed ${state.committedValue} version ${state.committedVersion}. Fully converged ${state.convergedValue} version ${state.convergedVersion}. ${replicas}. ${writeLabel().toLowerCase()}. Network ${networkLabel(state.network)}.`;
}

function renderDom() {
  updateControls();
  updateReplica("A"); updateReplica("B"); updateReplica("C");
  updateReadouts();
  announceState();
}

function measureCanvas() {
  const rect = field.getBoundingClientRect();
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  context.setTransform(dpr,0,0,dpr,0,0);
  return { width:rect.width, height:rect.height };
}

function centreOf(element) {
  const fieldRect = field.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return { x:rect.left-fieldRect.left+rect.width/2, y:rect.top-fieldRect.top+rect.height/2 };
}

function curveGeometry(start,end,bend) {
  const middle={x:(start.x+end.x)/2,y:(start.y+end.y)/2};
  const dx=end.x-start.x, dy=end.y-start.y, length=Math.max(1,Math.hypot(dx,dy));
  return { control:{x:middle.x-(dy/length)*bend,y:middle.y+(dx/length)*bend} };
}

function pointOnCurve(start,end,bend,t) {
  const {control}=curveGeometry(start,end,bend); const inv=1-t;
  return { x:inv*inv*start.x+2*inv*t*control.x+t*t*end.x, y:inv*inv*start.y+2*inv*t*control.y+t*t*end.y };
}

function strokeCurve(start,end,bend,{color="rgba(126,231,242,.20)",width=1.2,dash=[],glow=0,split=false}={}) {
  const {control}=curveGeometry(start,end,bend);
  context.save(); context.strokeStyle=color; context.lineWidth=width; context.setLineDash(dash); context.shadowColor=color; context.shadowBlur=glow;
  const draw=(from,to)=>{const a=pointOnCurve(start,end,bend,from),b=pointOnCurve(start,end,bend,to),m=pointOnCurve(start,end,bend,(from+to)/2);context.beginPath();context.moveTo(a.x,a.y);context.quadraticCurveTo(m.x,m.y,b.x,b.y);context.stroke()};
  if(split){draw(0,.41);draw(.59,1)} else {context.beginPath();context.moveTo(start.x,start.y);context.quadraticCurveTo(control.x,control.y,end.x,end.y);context.stroke()}
  context.restore();
}

function drawPacket(message,points) {
  const start=points[message.from], end=points[message.to];
  const target = message.from === "A" ? message.to : message.from;
  const bend = target === "B" ? (state.network===NETWORK_SLOW_B ? 108 : 38) : -38;
  const progress=messageProgress(state,message); const point=pointOnCurve(start,end,bend,progress);
  const palette = message.kind === "ack" ? {fill:"rgba(126,231,242,.98)",glow:"rgba(126,231,242,.95)"} : message.kind === "reconcile" ? {fill:"rgba(170,140,255,.98)",glow:"rgba(170,140,255,.9)"} : {fill:"rgba(245,166,35,.98)",glow:"rgba(245,166,35,.92)"};
  context.save(); context.globalCompositeOperation="lighter"; context.translate(point.x,point.y); context.rotate(Math.PI/4); context.fillStyle=palette.fill; context.shadowColor=palette.glow; context.shadowBlur=18; context.fillRect(-4,-4,8,8); context.restore();
  if (!reducedMotion.matches) {
    context.save(); context.fillStyle=palette.fill; context.globalAlpha=.18; for(let i=1;i<=4;i+=1){const trail=pointOnCurve(start,end,bend,Math.max(0,progress-i*.026));context.beginPath();context.arc(trail.x,trail.y,2.3,0,Math.PI*2);context.fill()} context.restore();
  }
}

function drawPartitionMark(start,end,bend) {
  const point=pointOnCurve(start,end,bend,.5); context.save(); context.translate(point.x,point.y); context.strokeStyle="rgba(226,75,74,.9)"; context.shadowColor="rgba(226,75,74,.8)"; context.shadowBlur=12; context.lineWidth=1.4; context.beginPath();context.moveTo(-8,-7);context.lineTo(7,8);context.moveTo(-7,8);context.lineTo(8,-7);context.stroke();context.restore();
}

function drawWave(origin,age,color,maxRadius) {
  if(age<0||age>900) return; const t=age/900; context.save();context.globalAlpha=(1-t)*.55;context.strokeStyle=color;context.lineWidth=1.5;context.beginPath();context.arc(origin.x,origin.y,30+t*maxRadius,0,Math.PI*2);context.stroke();context.restore();
}

function drawNetwork() {
  const {width,height}=measureCanvas(); context.clearRect(0,0,width,height);
  const points={A:centreOf(replicaElements.A),B:centreOf(replicaElements.B),C:centreOf(replicaElements.C),truth:centreOf(truth)};
  const slowB=state.network===NETWORK_SLOW_B, isolated=state.network===NETWORK_ISOLATE_C;

  strokeCurve(points.A,points.B,slowB?108:38,{color:slowB?"rgba(170,140,255,.34)":"rgba(126,231,242,.24)",width:slowB?1.8:1.35,dash:slowB?[8,11]:[],glow:slowB?10:4});
  if(slowB){strokeCurve(points.A,points.B,82,{color:"rgba(170,140,255,.08)",width:1,dash:[2,12]});strokeCurve(points.A,points.B,132,{color:"rgba(170,140,255,.06)",width:1,dash:[2,14]})}
  strokeCurve(points.A,points.C,-38,{color:isolated?"rgba(226,75,74,.3)":"rgba(126,231,242,.24)",width:1.35,dash:isolated?[3,9]:[],glow:isolated?8:4,split:isolated});
  if(isolated) drawPartitionMark(points.A,points.C,-38);
  strokeCurve(points.B,points.C,20,{color:"rgba(122,168,255,.08)",width:.9,dash:[2,11]});

  for(const id of ["A","B","C"]){const phase=nodePhase(state,id);const color=phase==="isolated"?"rgba(226,75,74,.08)":phase==="delayed"||phase==="stale"?"rgba(170,140,255,.12)":"rgba(126,231,242,.10)";context.save();context.strokeStyle=color;context.setLineDash([2,8]);context.beginPath();context.moveTo(points[id].x,points[id].y);context.lineTo(points.truth.x,points.truth.y);context.stroke();context.restore()}

  for(const message of state.inflight) drawPacket(message,points);
  if(state.committedVersion>0) drawWave(points.truth,state.now-state.committedAt,"rgba(126,231,242,.75)",150);
  if(state.convergedAt!==state.committedAt && state.convergedVersion>0) drawWave(points.truth,state.now-state.convergedAt,"rgba(101,240,181,.65)",190);
}

function render(){renderDom();drawNetwork()}
function frame(timestamp){frameHandle=requestAnimationFrame(frame);if(document.hidden){lastTimestamp=0;return}if(!lastTimestamp)lastTimestamp=timestamp;const elapsed=Math.min(120,Math.max(0,timestamp-lastTimestamp));lastTimestamp=timestamp;if(elapsed>0)state=advanceConsensus(state,elapsed);render()}

for(const button of modeButtons) button.addEventListener("click",()=>{state=setMode(state,button.dataset.mode===MODE_EVENTUAL?MODE_EVENTUAL:MODE_QUORUM);render()});
for(const button of networkButtons) button.addEventListener("click",()=>{const network=button.dataset.network;if(![NETWORK_CLEAN,NETWORK_SLOW_B,NETWORK_ISOLATE_C].includes(network))return;state=setNetwork(state,network);render()});
writeButton.addEventListener("click",()=>{state=beginWrite(state);focusedReplica=null;render()});
resetButton.addEventListener("click",()=>{state=createConsensusState();focusedReplica=null;lastTimestamp=0;render();writeButton.focus()});
for(const [id,element] of Object.entries(replicaElements)) element.addEventListener("click",()=>{focusedReplica=focusedReplica===id?null:id;renderDom()});
window.addEventListener("keydown",(event)=>{if(event.key==="Escape"&&focusedReplica){focusedReplica=null;renderDom();return}if(event.key.toLowerCase()==="r"&&!event.metaKey&&!event.ctrlKey&&!event.altKey){const target=event.target;const editable=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement||target?.isContentEditable;if(!editable){event.preventDefault();state=createConsensusState();focusedReplica=null;lastTimestamp=0;render()}}});
window.addEventListener("resize",drawNetwork,{passive:true});reducedMotion.addEventListener?.("change",drawNetwork);document.addEventListener("visibilitychange",()=>{lastTimestamp=0;if(!document.hidden)render()});
render();frameHandle=requestAnimationFrame(frame);window.addEventListener("pagehide",()=>cancelAnimationFrame(frameHandle),{once:true});
