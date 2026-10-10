
/* MDpentagon - BPM / reliability update 2026-10 */
'use strict';
const $ = id => document.getElementById(id);
const pages = ['intro','recording','analyzing','result'];
const show = page => pages.forEach(id => $(id)?.classList.toggle('hidden', id !== page));
const clamp = (x,lo=0,hi=100) => Math.min(hi,Math.max(lo,x));
const avg = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0;
const percentile = (a,p) => { if(!a.length)return 0; const b=[...a].sort((x,y)=>x-y); return b[Math.floor((b.length-1)*p)]; };
let stream=null,ctx=null,analyser=null,recorder=null,source=null,interval=null,raf=null;
let chunks=[],startTime=0,runId=0;
const names=['テンポ感','リズムの規則性','音の強さ','変化の大きさ','音の複雑さ'];
const desc=['音楽的な拍の速さ','拍の安定性','録音された音量の目安','音量変化の大きさ','音の周波数的な広がり'];
const bars=Array.from({length:30},()=>{let el=document.createElement('i');el.className='bar';$('bars').appendChild(el);return el;});

function stopTracks(){
 clearInterval(interval); cancelAnimationFrame(raf); interval=raf=null;
 if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;
 if(ctx && ctx.state!=='closed')ctx.close().catch(()=>{});
 ctx=null;source=null;analyser=null;recorder=null;
}
function reset(){runId++;stopTracks();show('intro');window.scrollTo({top:0,behavior:'smooth'});}
$('startBtn').addEventListener('click',startRecording);
$('stopBtn').addEventListener('click',stopRecording);
$('retryBtn').addEventListener('click',reset);
$('retryTop').addEventListener('click',reset);
async function startRecording(){
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  ctx=new (window.AudioContext||window.webkitAudioContext)(); await ctx.resume();
  source=ctx.createMediaStreamSource(stream);analyser=ctx.createAnalyser();analyser.fftSize=1024;source.connect(analyser);
  chunks=[];recorder=new MediaRecorder(stream);const id=++runId;
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  recorder.onstop=()=>analyze(id);
  recorder.start(250);startTime=performance.now();$('seconds').textContent='0';$('stopBtn').disabled=true;
  show('recording');interval=setInterval(tick,200);animate();
 }catch(e){console.warn(e);stopTracks();show('intro');alert('マイクを使えませんでした。マイクの許可を確認してください。');}
}
function tick(){const t=(performance.now()-startTime)/1000;$('seconds').textContent=Math.floor(t);$('stopBtn').disabled=t<8;
 $('recordHint').textContent=t<8?`あと${Math.ceil(8-t)}秒で分析できます`:'好きなタイミングで分析できます';if(t>=20)stopRecording();}
function animate(){if(!analyser)return;const f=new Uint8Array(analyser.frequencyBinCount);analyser.getByteFrequencyData(f);
 bars.forEach((el,i)=>{const v=f[Math.floor(i*f.length/bars.length)];el.style.height=`${clamp(7+v*.32,7,88)}px`;});raf=requestAnimationFrame(animate);}
function stopRecording(){if(!recorder||recorder.state==='inactive')return;clearInterval(interval);cancelAnimationFrame(raf);recorder.stop();show('analyzing');}
async function analyze(id){
 let decoded=null;try{const blob=new Blob(chunks,{type:recorder?.mimeType||'audio/mp4'});decoded=await ctx.decodeAudioData(await blob.arrayBuffer());}
 catch(e){console.warn('録音データの読み取り失敗',e);}
 if(id!==runId)return;
 if(!decoded){stopTracks();show('result');$('metricList').innerHTML='<p>録音データを読み取れませんでした。もう一度お試しください。</p>';
  $('bestMatch').textContent='分析できませんでした';$('matchList').innerHTML='';$('radar').getContext('2d').clearRect(0,0,640,600);return;}
 // Render acoustic results first, independent of the optional sound-event AI.
 const data=analyzeAudio(decoded);if(id!==runId)return;render(data);stopTracks();
 showSoundMessage('音の種類を確認しています…',data.quality);
 setTimeout(()=>classifySound(decoded,id,data.quality),120);
}

/* Efficient radix-2 FFT for onset detection (no third-party library). */
function fftPower(input){
 const n=input.length,re=Float64Array.from(input),im=new Float64Array(n);
 for(let i=1,j=0;i<n;i++) {let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;}}
 for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);
  for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let j=0;j<len/2;j++){const k=i+j,l=k+len/2;
   const tr=cr*re[l]-ci*im[l],ti=cr*im[l]+ci*re[l];re[l]=re[k]-tr;im[l]=im[k]-ti;re[k]+=tr;im[k]+=ti;
   const nr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=nr;}}}
 const out=new Float32Array(n/2);for(let i=0;i<out.length;i++)out[i]=Math.hypot(re[i],im[i]);return out;
}
function signalFeatures(buffer){
 const fs=buffer.sampleRate, channels=buffer.numberOfChannels;
 const target=11025,ratio=fs/target,N=512,hop=128;
 const count=Math.floor(buffer.length/ratio),wave=new Float32Array(count);
 const a=buffer.getChannelData(0),b=channels>1?buffer.getChannelData(1):null;
 for(let i=0;i<count;i++){const k=Math.floor(i*ratio);wave[i]=b?(a[k]+b[k])/2:a[k];}
 const rms=[],onsets=[],complex=[],window=new Float32Array(N);let prev=null,prevEnergy=0,peak=0;
 for(let i=0;i+N<=wave.length;i+=hop){let energy=0;for(let j=0;j<N;j++){const v=wave[i+j];energy+=v*v;
  window[j]=v*(.5-.5*Math.cos(2*Math.PI*j/(N-1)));peak=Math.max(peak,Math.abs(v));}
  const r=Math.sqrt(energy/N);rms.push(r);const sp=fftPower(window);let flux=0,sum=0,entropy=0;
  for(let k=2;k<sp.length;k++){const v=sp[k];sum+=v;if(prev)flux+=Math.max(0,v-prev[k]);}
  // Spectral entropy as a coarse complexity proxy.
  if(sum>0)for(let k=2;k<sp.length;k++){const p=sp[k]/sum;if(p>0)entropy-=p*Math.log(p);}
  complex.push(sum>0?entropy/Math.log(sp.length-2):0);
  const rise=Math.max(0,r-prevEnergy);onsets.push(flux/(sum+1e-8)*.75+rise/(r+.001)*.25);
  prev=sp;prevEnergy=r;
 }
 return {rms,onsets,complex,peak,rate:target/hop,duration:buffer.duration};
}
function correlation(x,lag,start=0,end=x.length){let s=0,xx=0,yy=0;
 for(let i=Math.max(lag,start);i<end;i++){const a=x[i],b=x[i-lag];s+=a*b;xx+=a*a;yy+=b*b;}
 return xx&&yy?s/Math.sqrt(xx*yy):0;}
function bpmCandidates(onsets,fps){
 // Local mean subtraction prevents a constant or noise floor from creating false beats.
 const smooth=onsets.map((_,i)=>avg(onsets.slice(Math.max(0,i-5),Math.min(onsets.length,i+6))));
 const x=onsets.map((v,i)=>Math.max(0,v-smooth[i]));
 const activity=avg(x),variance=avg(x.map(v=>(v-activity)**2));
 if(x.length<fps*7||activity<.002||variance<.000015)return {list:[],strength:0};
 const peaks=[];
 for(let bpm=65;bpm<=210;bpm+=1){const lag=60*fps/bpm;const l=Math.floor(lag),f=lag-l;
  const score=correlation(x,l)*(1-f)+correlation(x,l+1)*f;
  peaks.push({bpm,score});}
 const local=peaks.filter((p,i)=>i>0&&i<peaks.length-1&&p.score>=peaks[i-1].score&&p.score>=peaks[i+1].score);
 local.sort((a,b)=>b.score-a.score);
 return {list:local.slice(0,8),strength:activity};
}
function estimateBpm(feat){
 const {onsets,rate:r,duration}=feat;
 if(duration<8)return {bpm:null,confidence:0,reason:'録音時間が短いため'};
 const full=bpmCandidates(onsets,r),half=Math.floor(onsets.length/2);
 const left=bpmCandidates(onsets.slice(0,half),r),right=bpmCandidates(onsets.slice(half),r);
 if(!full.list.length||!left.list.length||!right.list.length)return {bpm:null,confidence:0,reason:'明確な拍が見つからなかったため'};
 const cands=full.list.map(c=>{
  const align=list=>Math.max(0,...list.map(v=>Math.max(0,1-Math.abs(v.bpm-c.bpm)/Math.max(8,c.bpm*.08))*v.score));
  const support=(align(left.list)+align(right.list))/2;
  // A repeated half-beat or double-beat can be a valid competing explanation.
  const alternative=full.list.filter(v=>v!==c&& (Math.abs(v.bpm-c.bpm*2)<7||Math.abs(v.bpm*2-c.bpm)<7));
  return {...c,support,ambiguous:alternative.some(v=>v.score>c.score*.96),rank:c.score*.5+support*.5};
 }).sort((a,b)=>b.rank-a.rank);
 const best=cands[0],runner=cands.find(v=>Math.abs(v.bpm-best.bpm)>9);
 const strength=best.score,consistency=best.support;
 // Conservative abstention: no number when the beat is not stable.
 if(strength<.19||consistency<.14)return {bpm:null,confidence:0,reason:'拍の周期が安定していないため'};
 if(runner&&runner.rank>best.rank*.92)return {bpm:null,confidence:0,reason:'複数のテンポ候補があり判断が難しいため'};
 if(best.ambiguous)return {bpm:null,confidence:0,reason:'倍速・半速の候補を区別できないため'};
 const confidence=clamp((strength*.5+consistency*.5)*100,0,100);
 return {bpm:Math.round(best.bpm),confidence,reason:'拍を検出'};
}
function analyzeAudio(buffer){
 const f=signalFeatures(buffer),a=f.rms,mean=avg(a),p10=percentile(a,.1),p90=percentile(a,.9);
 const db=20*Math.log10(mean+1e-8),peak=f.peak;
 const quality={duration:buffer.duration.toFixed(1),label:peak>.98?'音割れの可能性':mean<.003?'音量が小さめ':'録音できました'};
 const silent=mean<.003,tempo=silent?{bpm:null,confidence:0,reason:'音量が小さすぎるため'}:estimateBpm(f);
 const strength=clamp((db+55)*2.1),change=clamp(30*Math.log2(1+(p90-p10)/(mean+.001)));
 const complexity=clamp((avg(f.complex)-.35)*150);
 const regular=tempo.bpm===null?null:clamp(tempo.confidence*1.1);
 const speed=tempo.bpm===null?null:clamp((tempo.bpm-55)/1.5);
 return {values:[speed,regular,silent?null:strength,silent?null:change,silent?null:complexity],tempo,quality};
}
function drawRadar(values){const c=$('radar'),g=c.getContext('2d'),cx=c.width/2,cy=c.height/2+8,R=195;
 g.clearRect(0,0,c.width,c.height);const pt=(i,r)=>[cx+Math.cos(-Math.PI/2+i*2*Math.PI/5)*r,cy+Math.sin(-Math.PI/2+i*2*Math.PI/5)*r];
 for(let level=1;level<=4;level++){g.beginPath();for(let i=0;i<5;i++){const p=pt(i,R*level/4);i?g.lineTo(...p):g.moveTo(...p);}g.closePath();g.strokeStyle='#e5e0f7';g.lineWidth=2;g.stroke();}
 for(let i=0;i<5;i++){g.beginPath();g.moveTo(cx,cy);g.lineTo(...pt(i,R));g.strokeStyle='#ebe7f7';g.stroke();}
 if(values.every(v=>v!==null)){g.beginPath();values.forEach((v,i)=>{const p=pt(i,R*v/100);i?g.lineTo(...p):g.moveTo(...p);});g.closePath();g.fillStyle='#7257ff55';g.fill();g.strokeStyle='#7257ff';g.lineWidth=5;g.stroke();}
 else {values.forEach((v,i)=>{if(v===null)return;const p=pt(i,R*v/100);g.beginPath();g.moveTo(cx,cy);g.lineTo(...p);g.strokeStyle='#7257ff';g.lineWidth=5;g.stroke();});}
 g.textAlign='center';g.textBaseline='middle';names.forEach((n,i)=>{const p=pt(i,R+45);g.fillStyle='#353148';g.font='bold 21px sans-serif';g.fillText(['テンポ感','規則性','音の強さ','変化','複雑さ'][i],p[0],p[1]);g.fillStyle='#7257ff';g.font='bold 20px sans-serif';g.fillText(values[i]===null?'—':grade(values[i]),p[0],p[1]+26);});
}
function grade(v){return v<20?'低い':v<40?'やや低い':v<65?'中程度':v<85?'やや高い':'高い';}
function render(data){
 drawRadar(data.values);
 $('metricList').innerHTML=data.values.map((v,i)=>`<div class="metric"><div class="metric-top"><span>${names[i]}</span><strong>${v===null?'判定保留':grade(v)}</strong></div>${v===null?'':`<div class="track"><div class="fill" style="width:${v}%"></div></div>`}<small>${i===0?(data.tempo.bpm===null?`推定BPM：表示しません（${data.tempo.reason}）`:`推定BPM：約${data.tempo.bpm}（参考値）`):v===null?'音楽的な拍を確認できなかったため判定しません':desc[i]}</small></div>`).join('');
 const t=data.tempo.bpm;if(t===null){$('bestMatch').innerHTML='<p class="match-title">音の用途は判定保留</p><p>音楽的な拍を十分に確認できませんでした。生活音や環境音の可能性もあるため、集中・休息などの適性を無理に推定しません。</p>';$('matchList').innerHTML='';}
 else {const v=data.values,tempo=v[0],reg=v[1],pow=v[2],change=v[3],complex=v[4];
 const scores=[{name:'集中',icon:'✎',score:.25*reg+.25*(100-Math.abs(tempo-45))+.2*(100-change)+.15*(100-complex)+.15*(100-Math.abs(pow-40)),reason:'規則性や音の変化から見た参考候補です。個人差があります。'},
 {name:'休息',icon:'☾',score:.25*(100-tempo)+.15*reg+.25*(100-pow)+.2*(100-change)+.15*(100-complex),reason:'穏やかな音響特徴から見た参考候補です。'},
 {name:'気分転換',icon:'↗',score:.28*tempo+.17*reg+.25*pow+.2*change+.1*complex,reason:'活発な音響特徴から見た参考候補です。'}].sort((a,b)=>b.score-a.score);
 $('bestMatch').innerHTML=`<p class="match-title">${scores[0].icon} ${scores[0].name}の候補</p><p>${scores[0].reason}</p>`;
 $('matchList').innerHTML=scores.map(s=>`<div class="match-row"><span>${s.name}</span><div class="track"><div class="fill" style="width:${clamp(s.score)}%"></div></div><strong>${grade(clamp(s.score))}</strong></div>`).join('');}
 show('result');window.scrollTo({top:0,behavior:'smooth'});
}

/* Optional YAMNet sound recognition. This never blocks the main result. */
const groups=[
 ['🎵','音楽',['Music','Song','Dance music','Background music']],['🎤','歌声',['Singing','Choir','Humming','Rapping']],
 ['🗣️','話し声',['Speech','Conversation','Chatter']],['👣','足音',['Walk, footsteps','Run','Shuffle']],
 ['👏','拍手',['Clapping','Applause']],['🎹','ピアノ',['Piano']],['🎸','ギター',['Guitar']],
 ['🎸','ベース',['Bass guitar']],['🥁','ドラム・打楽器',['Drum','Cymbal','Percussion','Hi-hat']],
 ['🎛️','シンセサイザー',['Synthesizer']],['🎻','弦楽器',['Violin','Cello']],
 ['🎷','管楽器',['Flute','Saxophone','Trumpet']],['🐶','犬',['Dog','Bark']],
 ['🐱','猫',['Cat','Meow','Purr']],['🐦','鳥',['Bird','Chirp','Crow']],
 ['🐴','馬',['Horse','Neigh']],['🐸','カエル',['Frog','Croak']],
 ['🦗','昆虫',['Insect','Cricket']],['🌧️','雨',['Rain']],['🌬️','風',['Wind']],
 ['🚗','車',['Car','Traffic noise']],['🚆','電車',['Train','Subway']],
 ['🏠','生活音',['Dishes','Door','Typing','Vacuum cleaner']],['👥','ざわめき',['Crowd','Hubbub']]
];
function soundCard(){let card=$('soundDetectionCard');if(card)return card;card=document.createElement('section');card.id='soundDetectionCard';card.className='card';card.style.marginTop='18px';const chart=document.querySelector('#result .chart-card');chart.parentNode.insertBefore(card,chart.nextSibling);return card;}
function showSoundMessage(msg,q){soundCard().innerHTML=`<h3>この録音で検出された音</h3><p>録音時間：${q.duration}秒／${q.label}</p><p>${msg}</p>`;}
let classifierPromise=null;
function loadScript(url){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});}
async function getClassifier(){if(classifierPromise)return classifierPromise;
 classifierPromise=(async()=>{await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.20/audio_bundle.js');
 if(!window.FilesetResolver||!window.AudioClassifier)throw Error('AIライブラリを読み込めません');
 const fs=await window.FilesetResolver.forAudioTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.20/wasm');
 return window.AudioClassifier.createFromOptions(fs,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite'},maxResults:40,scoreThreshold:.03});})();
 return classifierPromise.catch(e=>{classifierPromise=null;throw e;});}
async function classifySound(buffer,id,q){
 try{const model=await Promise.race([getClassifier(),new Promise((_,reject)=>setTimeout(()=>reject(Error('timeout')),5000))]);if(id!==runId)return;
 const audio=buffer.getChannelData(0).slice(0,Math.floor(buffer.sampleRate*10));
 // Run after UI paint; this synchronous model can still be slow on older phones.
 const raw=model.classify(audio,buffer.sampleRate),cats=[];
 for(const r of raw||[])for(const c of r.classifications||[])for(const x of c.categories||[])cats.push({label:x.categoryName||x.displayName||'',score:x.score||0});
 const found=[];for(const [icon,name,words] of groups){const match=cats.filter(c=>words.some(w=>c.label.toLowerCase().includes(w.toLowerCase()))).sort((a,b)=>b.score-a.score)[0];if(match&&match.score>=.23)found.push({icon,name,score:match.score});}
 if(id!==runId)return;
 const card=soundCard();card.innerHTML=`<h3>この録音で検出された音</h3><p>録音時間：${q.duration}秒／${q.label}</p>`+
 (found.length?found.sort((a,b)=>b.score-a.score).map(f=>`<p>${f.icon} ${f.name} <small>（検出候補）</small></p>`).join(''):'<p>明確に分類できる音が見つかりませんでした。</p>')+
 '<small>音の種類はAIによる推定で、誤検出する場合があります。</small>';
 }catch(e){if(id===runId)showSoundMessage('音の種類のAI判定は利用できませんでした。五角形の分析には影響ありません。',q);console.warn('音分類',e);}
}
if('serviceWorker' in navigator && location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});
