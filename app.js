
/* MDpentagon - integrated stable edition (2026-10-11) */
'use strict';
const $ = id => document.getElementById(id);
const pages = ['intro','recording','analyzing','result'];
const show = name => pages.forEach(id => $(id).classList.toggle('hidden',id!==name));
const cap = (v,a=0,b=100) => Math.min(b,Math.max(a,v));
const mean = a => a.length ? a.reduce((s,v)=>s+v,0)/a.length : 0;
const pct = (a,p) => {if(!a.length)return 0;const x=[...a].sort((u,v)=>u-v);return x[Math.floor((x.length-1)*p)];};
let stream=null,context=null,mic=null,processor=null,mute=null,analyser=null,clock=null,raf=null;
let frames=[],startAt=0,session=0,recording=false,lastSoundURL=null;
const labels=['テンポ感','リズムの規則性','音の強さ','変化の大きさ','音の複雑さ'];
const bars=Array.from({length:30},()=>{const el=document.createElement('i');el.className='bar';$('bars').appendChild(el);return el;});
function cleanup(){recording=false;clearInterval(clock);cancelAnimationFrame(raf);clock=raf=null;
 if(processor){processor.onaudioprocess=null;try{processor.disconnect();}catch(_){}};
 if(mic)try{mic.disconnect();}catch(_){};if(analyser)try{analyser.disconnect();}catch(_){};
 if(mute)try{mute.disconnect();}catch(_){};if(stream)stream.getTracks().forEach(t=>t.stop());
 if(context&&context.state!=='closed')context.close().catch(()=>{});
 stream=context=mic=processor=mute=analyser=null;}
function reset(){session++;cleanup();show('intro');window.scrollTo({top:0,behavior:'smooth'});}
$('startBtn').addEventListener('click',start);
$('stopBtn').addEventListener('click',stop);
$('retryBtn').addEventListener('click',reset);
$('retryTop').addEventListener('click',reset);
async function start(){if(recording)return;const id=++session;
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('マイクに対応していません');
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  if(id!==session){stream.getTracks().forEach(t=>t.stop());return;}
  context=new (window.AudioContext||window.webkitAudioContext)();await context.resume();
  mic=context.createMediaStreamSource(stream);analyser=context.createAnalyser();analyser.fftSize=1024;
  processor=context.createScriptProcessor(2048,1,1);mute=context.createGain();mute.gain.value=0;
  mic.connect(analyser);mic.connect(processor);processor.connect(mute);mute.connect(context.destination);
  frames=[];processor.onaudioprocess=e=>{if(!recording)return;
    const a=e.inputBuffer.getChannelData(0);frames.push(new Float32Array(a));};
  recording=true;startAt=performance.now();$('seconds').textContent='0';$('stopBtn').disabled=true;
  show('recording');clock=setInterval(tick,150);visualize();
 }catch(e){console.warn('マイク開始エラー',e);cleanup();show('intro');alert('録音を開始できませんでした。Safariのマイク許可を確認してください。');}
}
function tick(){if(!recording)return;const sec=(performance.now()-startAt)/1000;
 $('seconds').textContent=String(Math.floor(sec));$('stopBtn').disabled=sec<8;
 $('recordHint').textContent=sec<8?`あと${Math.ceil(8-sec)}秒で分析できます`:'録音を止めて分析できます';
 if(sec>=20)stop();}
function visualize(){if(!recording||!analyser)return;const a=new Uint8Array(analyser.frequencyBinCount);analyser.getByteFrequencyData(a);
 bars.forEach((b,i)=>b.style.height=`${cap(7+a[Math.floor(i*a.length/bars.length)]*.32,7,88)}px`);
 raf=requestAnimationFrame(visualize);}
function stop(){if(!recording)return;const elapsed=(performance.now()-startAt)/1000;if(elapsed<7.9)return;
 const id=session,rate=context.sampleRate;recording=false;clearInterval(clock);cancelAnimationFrame(raf);
 const n=frames.reduce((s,a)=>s+a.length,0);const audio=new Float32Array(n);let k=0;
 for(const f of frames){audio.set(f,k);k+=f.length;}frames=[];cleanup();show('analyzing');
 // Allow the analyzing screen to paint before CPU work.
 setTimeout(()=>{if(id!==session)return;try{const data=analyzeAudio(audio,rate);render(data,audio,rate,id);}
 catch(e){console.error('分析エラー',e);show('result');$('metricList').textContent='分析に失敗しました。もう一度録音してください。';$('bestMatch').textContent='判定できませんでした';$('matchList').innerHTML='';}},60);
}
function fftMagnitude(input){const n=input.length,re=Float64Array.from(input),im=new Float64Array(n);
 for(let i=1,j=0;i<n;i++){let bit=n>>1;while(j&bit){j^=bit;bit>>=1;}j^=bit;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;}}
 for(let len=2;len<=n;len<<=1){const angle=-2*Math.PI/len,wr=Math.cos(angle),wi=Math.sin(angle);
  for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let j=0;j<len/2;j++){
   const u=i+j,v=u+len/2,rr=cr*re[v]-ci*im[v],ii=cr*im[v]+ci*re[v];
   re[v]=re[u]-rr;im[v]=im[u]-ii;re[u]+=rr;im[u]+=ii;
   const nr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=nr;
  }} }
 const out=new Float32Array(n/2);for(let i=0;i<out.length;i++)out[i]=Math.hypot(re[i],im[i]);return out;}
function features(audio,sampleRate){
 const target=11025,ratio=sampleRate/target,n=Math.floor(audio.length/ratio),wave=new Float32Array(n);
 // Linear interpolation avoids some aliasing compared with nearest-neighbor sampling.
 for(let i=0;i<n;i++){const p=i*ratio,j=Math.floor(p),f=p-j;wave[i]=(audio[j]||0)*(1-f)+(audio[j+1]||0)*f;}
 const N=512,H=128,window=new Float32Array(N),rms=[],entropy=[],onsets=[],bands=[[],[],[]];
 let prev=null,prevEnergy=0,prevBand=[0,0,0];
 for(let pos=0;pos+N<=wave.length;pos+=H){let energy=0;
  for(let j=0;j<N;j++){const x=wave[pos+j];energy+=x*x;window[j]=x*(.5-.5*Math.cos(2*Math.PI*j/(N-1)));}
  const level=Math.sqrt(energy/N);rms.push(level);const spec=fftMagnitude(window);let total=0,ent=0,flux=0;const b=[0,0,0];
  for(let j=2;j<spec.length;j++){const v=spec[j];total+=v;b[j<12?0:j<64?1:2]+=v;
    if(prev)flux+=Math.max(0,v-prev[j]);}
  if(total>1e-10)for(let j=2;j<spec.length;j++){const p=spec[j]/total;if(p>0)ent-=p*Math.log(p);}
  entropy.push(total>1e-10?ent/Math.log(spec.length-2):0);
  const rise=Math.max(0,level-prevEnergy);
  onsets.push(.7*flux/(total+.01)+.3*rise/(level+.002));
  for(let j=0;j<3;j++)bands[j].push(Math.max(0,Math.log1p(b[j])-Math.log1p(prevBand[j])));
  prev=spec;prevBand=b;prevEnergy=level;
 }
 return {rms,entropy,onsets,bands,fps:target/H};}
function novelty(a){const local=a.map((_,i)=>mean(a.slice(Math.max(0,i-4),Math.min(a.length,i+5))));
 const x=a.map((v,i)=>Math.max(0,v-local[i]));const m=mean(x),sd=Math.sqrt(mean(x.map(v=>(v-m)**2)));
 return {x:x.map(v=>v/(sd+1e-6)),activity:sd};}
function correlation(x,lag){const l=Math.floor(lag),f=lag-l;let ab=0,aa=0,bb=0;
 for(let i=l+1;i<x.length;i++){const a=x[i],b=x[i-l]*(1-f)+x[i-l-1]*f;ab+=a*b;aa+=a*a;bb+=b*b;}
 return aa>0&&bb>0?ab/Math.sqrt(aa*bb):0;}
function tempoCandidates(f){const streams=[f.onsets,...f.bands].map(novelty);
 if(streams[0].activity<.0005||f.onsets.length<f.fps*7)return {bpm:null,candidates:[],reason:'拍の手がかりが不足',confidence:0};
 const x=streams.map(s=>s.x),half=Math.floor(x[0].length/2),scores=[];
 for(let bpm=65;bpm<=210;bpm++){
  const lag=60*f.fps/bpm;
  const score=mean(x.map(v=>correlation(v,lag)));
  const first=correlation(x[0].slice(0,half),lag),second=correlation(x[0].slice(half),lag);
  const stable=Math.min(first,second);
  scores.push({bpm,score:.72*score+.28*Math.max(0,stable),stable});
 }
 const peaks=scores.filter((s,i)=>i>0&&i<scores.length-1&&s.score>=scores[i-1].score&&s.score>=scores[i+1].score)
  .sort((a,b)=>b.score-a.score);
 const distinct=[];for(const p of peaks){if(distinct.every(q=>Math.abs(q.bpm-p.bpm)>6))distinct.push(p);if(distinct.length===4)break;}
 const best=distinct[0],candidates=distinct.slice(0,3).map(v=>v.bpm);
 if(!best||best.score<.11||best.stable<.05)return {bpm:null,candidates,reason:'安定した拍を確認できません',confidence:0};
 const rival=distinct.slice(1).find(p=>p.score>best.score*.94);
 if(rival)return {bpm:null,candidates,reason:'複数のテンポ候補が競合',confidence:0};
 return {bpm:best.bpm,candidates,reason:'繰り返しの周期を検出',confidence:best.score};
}
function analyzeAudio(audio,rate){let sum=0,peak=0;
 for(let i=0;i<audio.length;i++){const v=audio[i];sum+=v*v;peak=Math.max(peak,Math.abs(v));}
 const rms=Math.sqrt(sum/Math.max(1,audio.length));const silent=rms<.00012&&peak<.0007;
 const gain=silent?1:cap(.075/(rms+1e-10),1,24);
 const normalized=new Float32Array(audio.length);
 for(let i=0;i<audio.length;i++)normalized[i]=cap(audio[i]*gain,-1,1);
 const f=features(normalized,rate),p10=pct(f.rms,.1),p90=pct(f.rms,.9),level=mean(f.rms);
 const tempo=silent?{bpm:null,candidates:[],reason:'ほぼ無音',confidence:0}:tempoCandidates(f);
 // Strength is recorded microphone level, not a calibrated decibel measurement.
 const power=cap((20*Math.log10(rms+1e-9)+65)*1.8);
 const change=cap(30*Math.log2(1+(p90-p10)/(level+.001)));
 const complex=cap((mean(f.entropy)-.35)*150);
 const speed=tempo.bpm===null?null:cap((tempo.bpm-55)/1.55);
 const regular=tempo.bpm===null?null:cap(tempo.confidence*170);
 return {values:[speed,regular,silent?null:power,silent?null:change,silent?null:complex],tempo,
  quality:{duration:(audio.length/rate).toFixed(1),rms:rms.toFixed(5),peak:peak.toFixed(3),label:silent?'ほぼ無音':peak>.98?'音割れの可能性':'録音できました'},silent};
}
function grade(v){return v===null?'判定保留':v<20?'低い':v<40?'やや低い':v<65?'中程度':v<85?'やや高い':'高い';}
function drawRadar(values){const canvas=$('radar'),g=canvas.getContext('2d'),cx=canvas.width/2,cy=canvas.height/2+8,R=195;
 g.clearRect(0,0,canvas.width,canvas.height);const point=(i,r)=>[cx+Math.cos(-Math.PI/2+i*2*Math.PI/5)*r,cy+Math.sin(-Math.PI/2+i*2*Math.PI/5)*r];
 for(let level=1;level<=4;level++){g.beginPath();for(let i=0;i<5;i++){const p=point(i,R*level/4);i?g.lineTo(...p):g.moveTo(...p);}g.closePath();g.strokeStyle='#e5e0f7';g.lineWidth=2;g.stroke();}
 for(let i=0;i<5;i++){g.beginPath();g.moveTo(cx,cy);g.lineTo(...point(i,R));g.strokeStyle='#ebe7f7';g.stroke();}
 const valid=values.map((v,i)=>({v,i})).filter(x=>x.v!==null);
 if(valid.length===5){g.beginPath();valid.forEach(({v,i})=>{const p=point(i,R*v/100);i?g.lineTo(...p):g.moveTo(...p);});g.closePath();g.fillStyle='#7257ff55';g.fill();g.strokeStyle='#7257ff';g.lineWidth=5;g.stroke();}
 else valid.forEach(({v,i})=>{g.beginPath();g.moveTo(cx,cy);g.lineTo(...point(i,R*v/100));g.strokeStyle='#7257ff';g.lineWidth=4;g.stroke();});
 g.textAlign='center';g.textBaseline='middle';labels.forEach((n,i)=>{const p=point(i,R+45);g.fillStyle='#353148';g.font='bold 21px sans-serif';g.fillText(['テンポ感','規則性','音の強さ','変化','複雑さ'][i],p[0],p[1]);g.fillStyle='#7257ff';g.font='bold 20px sans-serif';g.fillText(values[i]===null?'—':grade(values[i]),p[0],p[1]+26);});}
function createCard(id,afterSelector){let el=$(id);if(el)return el;el=document.createElement('section');el.id=id;el.className='card';el.style.marginTop='18px';el.style.padding='22px';
 const anchor=document.querySelector(afterSelector);if(anchor)anchor.insertAdjacentElement('afterend',el);else $('result').appendChild(el);return el;}
function render(data,audio,rate,id){drawRadar(data.values);
 $('metricList').innerHTML=data.values.map((v,i)=>`<div class="metric"><div class="metric-top"><span>${labels[i]}</span><strong>${grade(v)}</strong></div>${v===null?'':`<div class="track"><div class="fill" style="width:${v}%"></div></div>`}<small>${i===0?(data.tempo.bpm===null?'推定BPM：判定保留':`周期からの推定：約${data.tempo.bpm} BPM（参考）`):['','拍の安定性','録音レベル（音圧計ではありません）','静かな部分と強い部分の差','周波数成分の広がり'][i]}</small></div>`).join('');
 const candidates=data.tempo.candidates.length?data.tempo.candidates.join(' / ')+' BPM':'候補なし';
 $('metricList').insertAdjacentHTML('beforeend',`<div style="margin-top:16px;padding:14px;border-radius:14px;background:#f3efff;line-height:1.7"><strong>🔎 BPM解析メモ</strong><div>候補：${candidates}</div><div>理由：${data.tempo.reason}</div><small>音楽でない周期音にも反応するため参考値です。</small></div>`);
 const [t,r,p,c,x]=data.values;
 // These are descriptive activity suggestions, not proven treatment effects.
 const options=[
  {name:'休息',icon:'☾',score:Math.round(.32*(100-(p??50))+.30*(100-(c??50))+.20*(100-(t??50))+.18*(100-(x??50))),reason:'音量と変化が穏やかな音は、休憩時に試す候補になります。'},
  {name:'集中',icon:'✎',score:Math.round(.34*(r??50)+.26*(100-(c??50))+.22*(100-Math.abs((p??50)-40))+.18*(100-(x??50))),reason:'一定のリズムや変化の少なさが、作業時の背景音候補になります。'},
  {name:'気分転換・活動',icon:'↗',score:Math.round(.25*(t??50)+.30*(p??50)+.25*(c??50)+.20*(r??50)),reason:'速さや音の変化がある音は、活動前の気分転換に試す候補になります。'}
 ].sort((a,b)=>b.score-a.score);
 if(data.silent){$('bestMatch').innerHTML='<p class="match-title">判定保留</p><p>録音信号がほぼ無音です。別の端末で音を流してもう一度試してください。</p>';$('matchList').innerHTML='';}
 else{$('bestMatch').innerHTML=`<p class="match-title">${options[0].icon} ${options[0].name}の候補</p><p>${options[0].reason}</p>`;
 $('matchList').innerHTML=options.map(o=>`<div class="match-row"><span>${o.name}</span><div class="track"><div class="fill" style="width:${cap(o.score)}%"></div></div><strong>${grade(cap(o.score))}</strong></div>`).join('');}
 const q=createCard('recordQualityCard','#result .chart-card');
 q.innerHTML=`<h3>録音の確認</h3><p>録音 ${data.quality.duration} 秒 ／ ${data.quality.label}</p><p style="font-size:13px;color:#77718a">信号レベル RMS ${data.quality.rms} ／ 最大 ${data.quality.peak}</p><button id="playRecorded" class="secondary" type="button">▶ 録音を確認する</button><p style="font-size:12px;color:#77718a">音声は端末内だけで再生します。</p>`;
 if(lastSoundURL)URL.revokeObjectURL(lastSoundURL);lastSoundURL=URL.createObjectURL(wavBlob(audio,rate));
 $('playRecorded').addEventListener('click',()=>{const player=new Audio(lastSoundURL);player.play().catch(()=>alert('再生できませんでした'));});
 const sound=createCard('soundDetectionCard','#recordQualityCard');sound.innerHTML='<h3>この録音で検出された音</h3><p>音の種類を確認しています…</p>';
 show('result');window.scrollTo({top:0,behavior:'smooth'});
 // The optional classifier runs after the main result; failure never blocks the UI.
 setTimeout(()=>classifySounds(audio,rate,id),180);
}
function wavBlob(audio,rate){const n=audio.length,buf=new ArrayBuffer(44+n*2),v=new DataView(buf);
 const write=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
 write(0,'RIFF');v.setUint32(4,36+n*2,true);write(8,'WAVE');write(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);write(36,'data');v.setUint32(40,n*2,true);
 for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.round(cap(audio[i],-1,1)*32767),true);return new Blob([buf],{type:'audio/wav'});}
const groups=[
 ['🎵','音楽',['Music','Song','Dance music','Background music']],['🎤','歌声',['Singing','Choir','Humming','Rapping']],
 ['🗣️','話し声',['Speech','Conversation']],['👣','足音',['Walk, footsteps','Run']],['👏','拍手',['Clapping','Applause']],
 ['🎹','ピアノ',['Piano']],['🎸','ギター',['Guitar']],['🎸','ベース',['Bass guitar']],
 ['🥁','ドラム・打楽器',['Drum','Cymbal','Percussion']],['🎛️','シンセサイザー',['Synthesizer']],
 ['🎻','弦楽器',['Violin','Cello']],['🎷','管楽器',['Flute','Saxophone','Trumpet']],
 ['🐶','犬',['Dog','Bark']],['🐱','猫',['Cat','Meow']],['🐦','鳥',['Bird','Chirp']],
 ['🐴','馬',['Horse','Neigh']],['🐸','カエル',['Frog','Croak']],['🦗','昆虫',['Insect','Cricket']],
 ['🌧️','雨',['Rain']],['🌬️','風',['Wind']],['🚗','車',['Car','Traffic noise']],
 ['🚆','電車',['Train']],['🏠','生活音',['Dishes','Door','Typing']],['👥','ざわめき',['Crowd','Hubbub']]
];
let classifierPromise=null;
async function getClassifier(){if(classifierPromise)return classifierPromise;
 classifierPromise=(async()=>{
  const mod=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.20/+esm');
  const files=await mod.FilesetResolver.forAudioTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.20/wasm');
  return mod.AudioClassifier.createFromOptions(files,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite'},maxResults:60,scoreThreshold:.03});
 })();return classifierPromise.catch(e=>{classifierPromise=null;throw e;});}
async function classifySounds(audio,rate,id){const card=$('soundDetectionCard');
 try{
  const model=await Promise.race([getClassifier(),new Promise((_,reject)=>setTimeout(()=>reject(Error('AIの読み込み時間超過')),6500))]);
  if(id!==session)return;
  // Short segment limits mobile CPU load; event classification is a best-effort feature.
  const size=Math.min(16000*3,Math.floor(audio.length*16000/rate)),clip=new Float32Array(size);
  for(let i=0;i<size;i++){const pos=i*rate/16000,j=Math.floor(pos),f=pos-j;clip[i]=(audio[j]||0)*(1-f)+(audio[j+1]||0)*f;}
  const result=model.classify(clip,16000),categories=[];
  for(const r of result||[])for(const c of r.classifications||[])for(const x of c.categories||[])categories.push({label:x.categoryName||x.displayName||'',score:x.score||0});
  const found=[];for(const [icon,name,words] of groups){const match=categories.filter(c=>words.some(w=>c.label.toLowerCase().includes(w.toLowerCase()))).sort((a,b)=>b.score-a.score)[0];
   if(match&&match.score>=.25)found.push({icon,name,score:match.score});}
  if(id!==session)return;
  card.innerHTML='<h3>この録音で検出された音</h3>'+(found.length?found.sort((a,b)=>b.score-a.score).slice(0,8).map(x=>`<p>${x.icon} ${x.name}（検出候補）</p>`).join(''):'<p>明確に分類できる音が見つかりませんでした。</p>')+'<small>AIの推定結果です。誤認識する場合があります。</small>';
 }catch(e){console.warn('音の種類判定',e);if(id===session)card.innerHTML='<h3>この録音で検出された音</h3><p>音の種類のAI判定は利用できませんでした。ほかの分析結果には影響しません。</p>';}
}
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});
