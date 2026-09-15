const $ = (id) => document.getElementById(id);
const sections = ['intro','recording','analyzing','result'];
const show = (id) => sections.forEach(s => $(s).classList.toggle('hidden', s !== id));

let stream, recorder, audioCtx, analyser, source, timerId, animationId;
let chunks = [], samples = [], spectra = [], startedAt = 0;

const metricInfo = [
  ['テンポ感','音の速さ・拍の細かさ'],
  ['リズムの規則性','一定のリズムが続く度合い'],
  ['音の強さ','音量と音の力強さ'],
  ['変化の大きさ','静かな部分と強い部分の差'],
  ['音の複雑さ','同時に含まれる音の広がり']
];

const bars = Array.from({length:30}, () => {
  const el = document.createElement('i'); el.className = 'bar'; $('bars').appendChild(el); return el;
});

$('startBtn').addEventListener('click', startRecording);
$('stopBtn').addEventListener('click', stopRecording);
$('retryBtn').addEventListener('click', reset);
$('retryTop').addEventListener('click', reset);

async function startRecording(){
  try {
    stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();
    source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048; analyser.smoothingTimeConstant = .25;
    source.connect(analyser);
    recorder = new MediaRecorder(stream);
    chunks=[]; samples=[]; spectra=[];
    recorder.ondataavailable = e => { if(e.data.size) chunks.push(e.data); };
    recorder.onstop = analyze;
    recorder.start(250);
    startedAt = performance.now();
    $('seconds').textContent='0'; $('stopBtn').disabled=true;
    show('recording');
    timerId=setInterval(updateTimer,200);
    visualize();
  } catch(err) {
    alert('マイクを使用できませんでした。ブラウザの設定でマイクを許可して、もう一度お試しください。');
    cleanup(); show('intro');
  }
}

function updateTimer(){
  const sec=(performance.now()-startedAt)/1000;
  $('seconds').textContent=Math.floor(sec);
  $('stopBtn').disabled=sec<8;
  $('recordHint').textContent=sec<8 ? `あと${Math.ceil(8-sec)}秒で分析できます` : '好きなタイミングで分析できます';
  if(sec>=20) stopRecording();
}

function visualize(){
  if(!analyser) return;
  const time=new Uint8Array(analyser.fftSize), freq=new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(time); analyser.getByteFrequencyData(freq);
  let sum=0; for(const v of time){ const x=(v-128)/128; sum+=x*x; }
  const rms=Math.sqrt(sum/time.length); samples.push({t:performance.now()-startedAt,rms});
  let weighted=0,total=0,active=0;
  for(let i=1;i<freq.length;i++){ const p=freq[i]/255; weighted+=i*p; total+=p; if(p>.12) active++; }
  spectra.push({centroid:total?weighted/total/freq.length:0, spread:active/freq.length});
  bars.forEach((b,i)=>{ const idx=Math.floor(i*freq.length/bars.length); b.style.height=`${Math.max(7,Math.min(88,7+freq[idx]*.32))}px`; });
  animationId=requestAnimationFrame(visualize);
}

function stopRecording(){
  if(!recorder || recorder.state==='inactive') return;
  clearInterval(timerId); cancelAnimationFrame(animationId);
  recorder.stop(); show('analyzing');
}

async function analyze(){
  const blob=new Blob(chunks,{type:recorder.mimeType});
  let decoded;
  try { decoded=await audioCtx.decodeAudioData(await blob.arrayBuffer()); } catch(e) { decoded=null; }
  const metrics=calculateMetrics(decoded);
  setTimeout(()=>renderResults(metrics),700);
}

function clamp(v,min=0,max=100){ return Math.max(min,Math.min(max,v)); }
function mean(a){ return a.length?a.reduce((x,y)=>x+y,0)/a.length:0; }
function std(a){ const m=mean(a); return Math.sqrt(mean(a.map(x=>(x-m)**2))); }

function calculateMetrics(decoded){
  let env=samples.map(x=>x.rms);
  if(decoded){
    const data=decoded.getChannelData(0), rate=decoded.sampleRate, frame=Math.floor(rate*.05);
    env=[];
    for(let i=0;i+frame<data.length;i+=frame){ let s=0; for(let j=0;j<frame;j+=4)s+=data[i+j]**2; env.push(Math.sqrt(s/(frame/4))); }
  }
  const avg=mean(env), variability=avg?std(env)/avg:0;
  const sorted=[...env].sort((a,b)=>a-b);
  const p10=sorted[Math.floor(sorted.length*.1)]||0, p90=sorted[Math.floor(sorted.length*.9)]||0;
  const power=clamp((20*Math.log10(avg+1e-6)+55)*2.2);
  const change=clamp(((p90-p10)/(avg+.0001))*42);
  const complexity=clamp((mean(spectra.map(x=>x.spread))-.03)*260 + mean(spectra.map(x=>x.centroid))*38);
  const tempoData=estimateTempo(env,20);
  const tempo=clamp((tempoData.bpm-55)/1.15);
  const regularity=clamp(tempoData.confidence*115 - variability*12 + 16);
  return { values:[tempo,regularity,power,change,complexity].map(Math.round), bpm:Math.round(tempoData.bpm) };
}

function estimateTempo(env,fps){
  if(env.length<80) return {bpm:90,confidence:.35};
  const smooth=env.map((_,i)=>mean(env.slice(Math.max(0,i-1),i+2)));
  const onset=smooth.map((v,i)=>Math.max(0,v-(smooth[i-1]||v)));
  const minLag=Math.floor(fps*60/180), maxLag=Math.ceil(fps*60/55);
  let bestLag=Math.round(fps*60/100), best=-1, total=0;
  for(let lag=minLag;lag<=maxLag;lag++){
    let c=0; for(let i=lag;i<onset.length;i++) c+=onset[i]*onset[i-lag];
    total+=c; if(c>best){best=c;bestLag=lag;}
  }
  return {bpm:clamp(60*fps/bestLag,55,180),confidence:total?best/(total/(maxLag-minLag+1)+1e-9)/5:.3};
}

function renderResults(data){
  cleanup();
  drawRadar(data.values);
  $('metricList').innerHTML=data.values.map((v,i)=>`<div class="metric"><div class="metric-top"><span>${metricInfo[i][0]}</span><strong>${v}</strong></div><div class="track"><div class="fill" style="width:${v}%"></div></div><small>${i===0?`推定テンポ：約${data.bpm} BPM`:metricInfo[i][1]}</small></div>`).join('');
  const matches=scoreMatches(data.values);
  const best=matches[0];
  $('bestMatch').innerHTML=`<p class="match-title">${best.icon} ${best.name}の候補</p><p>${best.reason}</p>`;
  $('matchList').innerHTML=matches.map(m=>`<div class="match-row"><span>${m.name}</span><div class="track"><div class="fill" style="width:${m.score}%"></div></div><strong>${m.score}</strong></div>`).join('');
  show('result'); window.scrollTo({top:0,behavior:'smooth'});
}

function scoreMatches(v){
  const [tempo,regular,power,change,complex]=v;
  const proximity=(x,target)=>100-Math.abs(x-target);
  const list=[
    {name:'集中',icon:'✎',score:.20*proximity(tempo,45)+.30*regular+.20*proximity(power,38)+.18*(100-change)+.12*(100-complex),reason:'一定の流れと控えめな変化は、作業中の背景音候補になります。歌詞が気になる場合は器楽曲も試してみましょう。'},
    {name:'休息',icon:'☾',score:.28*(100-tempo)+.12*regular+.25*(100-power)+.22*(100-change)+.13*(100-complex),reason:'穏やかな速さと音量、変化の少なさは、休憩時間に気持ちを落ち着けたい時の候補になります。'},
    {name:'気分転換',icon:'↗',score:.27*tempo+.12*regular+.26*power+.23*change+.12*complex,reason:'テンポ感や音の力、展開の変化は、休憩後や活動前に気持ちを切り替えたい時の候補になります。'}
  ];
  return list.map(x=>({...x,score:Math.round(clamp(x.score))})).sort((a,b)=>b.score-a.score);
}

function drawRadar(values){
  const c=$('radar'),ctx=c.getContext('2d'),cx=c.width/2,cy=c.height/2+10,R=205;
  ctx.clearRect(0,0,c.width,c.height);
  const point=(i,r)=>{const a=-Math.PI/2+i*Math.PI*2/5;return[cx+Math.cos(a)*r,cy+Math.sin(a)*r]};
  for(let level=1;level<=4;level++){
    ctx.beginPath(); for(let i=0;i<5;i++){const p=point(i,R*level/4);i?ctx.lineTo(...p):ctx.moveTo(...p)}ctx.closePath();ctx.strokeStyle='#e5e0f7';ctx.lineWidth=2;ctx.stroke();
  }
  for(let i=0;i<5;i++){const p=point(i,R);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(...p);ctx.strokeStyle='#ebe7f7';ctx.stroke();}
  const grad=ctx.createLinearGradient(cx-R,cy-R,cx+R,cy+R);grad.addColorStop(0,'#55d7bd99');grad.addColorStop(.5,'#7257ff99');grad.addColorStop(1,'#ff6fae99');
  ctx.beginPath(); values.forEach((v,i)=>{const p=point(i,R*v/100);i?ctx.lineTo(...p):ctx.moveTo(...p)});ctx.closePath();ctx.fillStyle=grad;ctx.fill();ctx.strokeStyle='#7257ff';ctx.lineWidth=6;ctx.lineJoin='round';ctx.stroke();
  values.forEach((v,i)=>{const p=point(i,R*v/100);ctx.beginPath();ctx.arc(...p,8,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#7257ff';ctx.lineWidth=5;ctx.stroke();});
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#353148';ctx.font='700 24px -apple-system, sans-serif';
  const labels=['テンポ感','規則性','音の強さ','変化','複雑さ'];
  labels.forEach((label,i)=>{const p=point(i,R+50);ctx.fillText(label,p[0],p[1]);ctx.fillStyle='#7257ff';ctx.font='800 22px -apple-system, sans-serif';ctx.fillText(values[i],p[0],p[1]+27);ctx.fillStyle='#353148';ctx.font='700 24px -apple-system, sans-serif';});
}

function cleanup(){
  clearInterval(timerId);cancelAnimationFrame(animationId);
  if(stream) stream.getTracks().forEach(t=>t.stop());
  if(audioCtx && audioCtx.state!=='closed') audioCtx.close().catch(()=>{});
  stream=recorder=audioCtx=analyser=source=null;
}
function reset(){ cleanup(); show('intro'); window.scrollTo({top:0,behavior:'smooth'}); }

if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(()=>{});
