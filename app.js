
/* MDpentagon: BPM diagnostics + safe results (2026-10) */
'use strict';
const $=id=>document.getElementById(id);
const pages=['intro','recording','analyzing','result'];
const show=id=>pages.forEach(p=>$(p)?.classList.toggle('hidden',p!==id));
const clamp=(x,a=0,b=100)=>Math.min(b,Math.max(a,x));
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const quantile=(a,p)=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);return b[Math.floor((b.length-1)*p)];};
let stream=null,ctx=null,source=null,analyser=null,recorder=null,timer=null,animation=null;
let chunks=[],started=0,run=0;
const names=['テンポ感','リズムの規則性','音の強さ','変化の大きさ','音の複雑さ'];
const explanations=['拍の速さ','拍の安定性','録音された音量の目安','音量の変化','周波数成分の広がり'];
const bars=Array.from({length:30},()=>{const e=document.createElement('i');e.className='bar';$('bars').appendChild(e);return e;});
function cleanup(){clearInterval(timer);cancelAnimationFrame(animation);if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;
 if(ctx&&ctx.state!=='closed')ctx.close().catch(()=>{});ctx=null;source=null;analyser=null;recorder=null;}
function reset(){run++;cleanup();show('intro');window.scrollTo({top:0,behavior:'smooth'});}
$('startBtn').addEventListener('click',startRecording);
$('stopBtn').addEventListener('click',stopRecording);
$('retryBtn').addEventListener('click',reset);
$('retryTop').addEventListener('click',reset);
async function startRecording(){try{
 stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
 ctx=new (window.AudioContext||window.webkitAudioContext)();await ctx.resume();source=ctx.createMediaStreamSource(stream);
 analyser=ctx.createAnalyser();analyser.fftSize=1024;source.connect(analyser);
 chunks=[];const id=++run;recorder=new MediaRecorder(stream);
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=()=>analyze(id);
 recorder.start(250);started=performance.now();$('seconds').textContent='0';$('stopBtn').disabled=true;show('recording');
 timer=setInterval(tick,200);animate();
 }catch(e){console.warn(e);cleanup();show('intro');alert('マイクを使えませんでした。マイクの許可を確認してください。');}}
function tick(){const s=(performance.now()-started)/1000;$('seconds').textContent=Math.floor(s);$('stopBtn').disabled=s<8;
 $('recordHint').textContent=s<8?`あと${Math.ceil(8-s)}秒で分析できます`:'録音を止めて分析できます';if(s>=20)stopRecording();}
function animate(){if(!analyser)return;const f=new Uint8Array(analyser.frequencyBinCount);analyser.getByteFrequencyData(f);
 bars.forEach((e,i)=>e.style.height=`${clamp(7+f[Math.floor(i*f.length/bars.length)]*.32,7,88)}px`);
 animation=requestAnimationFrame(animate);}
function stopRecording(){if(!recorder||recorder.state==='inactive')return;clearInterval(timer);cancelAnimationFrame(animation);recorder.stop();show('analyzing');}
async function analyze(id){let decoded=null;try{const blob=new Blob(chunks,{type:recorder?.mimeType||'audio/mp4'});decoded=await ctx.decodeAudioData(await blob.arrayBuffer());}
 catch(e){console.warn('音声の読み込みに失敗',e);}if(id!==run)return;
 if(!decoded){cleanup();show('result');$('metricList').textContent='録音を読み取れませんでした。もう一度録音してください。';
 $('bestMatch').textContent='分析できませんでした';$('matchList').innerHTML='';$('radar').getContext('2d').clearRect(0,0,640,600);return;}
 const data=analyzeAudio(decoded);if(id!==run)return;render(data);cleanup();
 showSound('音の種類を調べています…',data.quality);
 setTimeout(()=>classifySound(decoded,id,data.quality),150);
}
/* Fast FFT: used for spectral onset detection, not to identify a particular song. */
function spectrum(frame){const n=frame.length,re=Float64Array.from(frame),im=new Float64Array(n);
 for(let i=1,j=0;i<n;i++){let bit=n>>1;while(j&bit){j^=bit;bit>>=1;}j^=bit;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;}}
 for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);
 for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let j=0;j<len/2;j++){
 const k=i+j,l=k+len/2,tr=cr*re[l]-ci*im[l],ti=cr*im[l]+ci*re[l];re[l]=re[k]-tr;im[l]=im[k]-ti;re[k]+=tr;im[k]+=ti;
 const nr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=nr;}}}
 const out=new Float32Array(n/2);for(let i=0;i<out.length;i++)out[i]=Math.hypot(re[i],im[i]);return out;}
function extract(buffer){const fs=buffer.sampleRate,target=11025,ratio=fs/target;
 const a=buffer.getChannelData(0),b=buffer.numberOfChannels>1?buffer.getChannelData(1):null;
 const wave=new Float32Array(Math.floor(buffer.length/ratio));for(let i=0;i<wave.length;i++){
 const k=Math.min(a.length-1,Math.floor(i*ratio));wave[i]=b?(a[k]+b[k])*.5:a[k];}
 const n=512,hop=128,rate=target/hop,window=new Float32Array(n),rms=[],entropy=[],onsets=[],bandOnsets=[[],[],[]];
 let previous=null,prevBands=[0,0,0],prevEnergy=0,peak=0;
 for(let pos=0;pos+n<=wave.length;pos+=hop){let power=0;
 for(let j=0;j<n;j++){const v=wave[pos+j];power+=v*v;peak=Math.max(peak,Math.abs(v));window[j]=v*(.5-.5*Math.cos(2*Math.PI*j/(n-1)));}
 const energy=Math.sqrt(power/n);rms.push(energy);const sp=spectrum(window);let total=0,h=0;const bands=[0,0,0];
 for(let k=2;k<sp.length;k++){const v=sp[k];total+=v;bands[k<12?0:k<65?1:2]+=v;}
 if(total>0){for(let k=2;k<sp.length;k++){const p=sp[k]/total;if(p>0)h-=p*Math.log(p);}}
 entropy.push(total>0?h/Math.log(sp.length-2):0);
 let flux=0;if(previous){for(let k=2;k<sp.length;k++)flux+=Math.max(0,sp[k]-previous[k]);}
 const rise=Math.max(0,energy-prevEnergy);onsets.push(flux/(total+.001)*.7+rise/(energy+.003)*.3);
 for(let j=0;j<3;j++){const change=Math.max(0,Math.log1p(bands[j])-Math.log1p(prevBands[j]));bandOnsets[j].push(change);}
 previous=sp;prevBands=bands;prevEnergy=energy;}
 return {rms,entropy,onsets,bandOnsets,peak,rate,duration:buffer.duration};}
function novelty(a){const smooth=a.map((_,i)=>mean(a.slice(Math.max(0,i-4),Math.min(a.length,i+5))));
 const x=a.map((v,i)=>Math.max(0,v-smooth[i]));const m=mean(x),sd=Math.sqrt(mean(x.map(v=>(v-m)**2)));
 return {x:x.map(v=>v/(sd+.00001)),activity:m,sd};}
function autocorr(x,lag){const l=Math.floor(lag),frac=lag-l;let sum=0,aa=0,bb=0;
 for(let i=l+1;i<x.length;i++){const a=x[i],b=x[i-l]*(1-frac)+x[i-l-1]*frac;sum+=a*b;aa+=a*a;bb+=b*b;}
 return aa&&bb?sum/Math.sqrt(aa*bb):0;}
function tempoPeaks(x,fps){if(x.length<fps*3)return [];
 const scores=[];for(let bpm=65;bpm<=210;bpm++){
 const lag=60*fps/bpm;const s=autocorr(x,lag);scores.push({bpm,score:s});}
 return scores.filter((p,i)=>i>0&&i<scores.length-1&&p.score>=scores[i-1].score&&p.score>=scores[i+1].score)
 .sort((a,b)=>b.score-a.score).slice(0,12);}
function estimateTempo(f){const fps=f.rate,features=[f.onsets,...f.bandOnsets].map(novelty);
 const activity=features[0].sd;if(f.duration<8||activity<.003)return {bpm:null,reason:'音の立ち上がりが少ないため',candidates:[],confidence:'低'};
 const full=features.map(z=>tempoPeaks(z.x,fps)),mid=Math.floor(f.onsets.length/2);
 const halves=[features[0].x.slice(0,mid),features[0].x.slice(mid)].map(x=>tempoPeaks(x,fps));
 const all=new Map();for(const list of full)for(const p of list){const key=p.bpm;all.set(key,(all.get(key)||0)+p.score);}
 const scores=[];for(let bpm=65;bpm<=210;bpm++){
 const spectral=full.reduce((sum,list)=>sum+Math.max(0,...list.filter(p=>Math.abs(p.bpm-bpm)<=2).map(p=>p.score)),0)/full.length;
 const support=halves.reduce((sum,list)=>sum+Math.max(0,...list.filter(p=>Math.abs(p.bpm-bpm)<=Math.max(5,bpm*.04)).map(p=>p.score)),0)/2;
 const fullDirect=autocorr(features[0].x,60*fps/bpm);
 const score=.45*spectral+.35*support+.20*fullDirect;
 scores.push({bpm,score,support,direct:fullDirect});}
 const maxima=scores.filter((p,i)=>i>0&&i<scores.length-1&&p.score>=scores[i-1].score&&p.score>=scores[i+1].score)
 .sort((a,b)=>b.score-a.score);
 const top=[];for(const p of maxima){if(top.every(v=>Math.abs(v.bpm-p.bpm)>7))top.push(p);if(top.length===4)break;}
 const candidates=top.slice(0,3).map(p=>p.bpm);const best=top[0];
 if(!best||best.score<.17||best.support<.12)return {bpm:null,reason:'拍の周期が安定していないため',candidates,confidence:'低'};
 const rival=top.slice(1).find(p=>p.score>best.score*.92);
 if(rival)return {bpm:null,reason:'複数のテンポ候補が競合しているため',candidates,confidence:'低'};
 const half=top.slice(1).find(p=>Math.abs(p.bpm*2-best.bpm)<5||Math.abs(p.bpm-best.bpm*2)<5);
 if(half&&half.score>best.score*.95)return {bpm:null,reason:'倍速・半速の区別が難しいため',candidates,confidence:'低'};
 return {bpm:best.bpm,reason:'拍の繰り返しを検出',candidates,confidence:best.score>.34?'比較的高い':'参考値'};}
function analyzeAudio(buffer){const f=extract(buffer),level=mean(f.rms),q10=quantile(f.rms,.1),q90=quantile(f.rms,.9);
 const silent=level<.003,tempo=silent?{bpm:null,reason:'音量が小さすぎるため',candidates:[],confidence:'低'}:estimateTempo(f);
 const volume=clamp((20*Math.log10(level+1e-8)+55)*2.1),change=clamp(30*Math.log2(1+(q90-q10)/(level+.001)));
 const complexity=clamp((mean(f.entropy)-.35)*150),speed=tempo.bpm===null?null:clamp((tempo.bpm-55)/1.5);
 const regular=tempo.bpm===null?null:clamp(tempo.confidence==='比較的高い'?76:55);
 const quality={duration:buffer.duration.toFixed(1),label:f.peak>.98?'音割れの可能性':silent?'音量が小さめ':'録音できました'};
 return {values:[speed,regular,silent?null:volume,silent?null:change,silent?null:complexity],tempo,quality};}
function grade(v){return v<20?'低い':v<40?'やや低い':v<65?'中程度':v<85?'やや高い':'高い';}
function drawRadar(values){const c=$('radar'),g=c.getContext('2d'),cx=c.width/2,cy=c.height/2+8,R=195;
 g.clearRect(0,0,c.width,c.height);const point=(i,r)=>[cx+Math.cos(-Math.PI/2+i*2*Math.PI/5)*r,cy+Math.sin(-Math.PI/2+i*2*Math.PI/5)*r];
 for(let j=1;j<=4;j++){g.beginPath();for(let i=0;i<5;i++){const p=point(i,R*j/4);i?g.lineTo(...p):g.moveTo(...p);}g.closePath();g.strokeStyle='#e5e0f7';g.lineWidth=2;g.stroke();}
 for(let i=0;i<5;i++){g.beginPath();g.moveTo(cx,cy);g.lineTo(...point(i,R));g.strokeStyle='#ebe7f7';g.stroke();}
 const valid=values.map((v,i)=>({v,i})).filter(x=>x.v!==null);
 if(valid.length===5){g.beginPath();valid.forEach(({v,i})=>{const p=point(i,R*v/100);i?g.lineTo(...p):g.moveTo(...p);});g.closePath();g.fillStyle='#7257ff55';g.fill();g.strokeStyle='#7257ff';g.lineWidth=5;g.stroke();}
 else valid.forEach(({v,i})=>{g.beginPath();g.moveTo(cx,cy);g.lineTo(...point(i,R*v/100));g.strokeStyle='#7257ff';g.lineWidth=5;g.stroke();});
 g.textAlign='center';g.textBaseline='middle';names.forEach((n,i)=>{const p=point(i,R+45);g.fillStyle='#353148';g.font='bold 21px sans-serif';g.fillText(['テンポ感','規則性','音の強さ','変化','複雑さ'][i],p[0],p[1]);g.fillStyle='#7257ff';g.font='bold 20px sans-serif';g.fillText(values[i]===null?'—':grade(values[i]),p[0],p[1]+26);});}
function diagnostics(t){const options=t.candidates?.length?t.candidates.join(' / ')+' BPM':'候補を検出できませんでした';
 return `<section style="margin-top:16px;padding:16px;border-radius:18px;background:#f4f0ff;line-height:1.8"><strong>🔎 BPMの解析メモ</strong><div>推定：${t.bpm===null?'判定保留':t.bpm+' BPM'}</div><div>候補：${options}</div><div>理由：${t.reason}</div><small>候補は確定値ではありません。音楽以外の音でも周期が検出されることがあります。</small></section>`;}
function render(data){drawRadar(data.values);
 $('metricList').innerHTML=data.values.map((v,i)=>`<div class="metric"><div class="metric-top"><span>${names[i]}</span><strong>${v===null?'判定保留':grade(v)}</strong></div>${v===null?'':`<div class="track"><div class="fill" style="width:${v}%"></div></div>`}<small>${i===0?(data.tempo.bpm===null?'推定BPM：判定保留':`推定BPM：約${data.tempo.bpm}（参考値）`):v===null?'拍を確認できないため保留':explanations[i]}</small></div>`).join('')+diagnostics(data.tempo);
 if(data.tempo.bpm===null){$('bestMatch').innerHTML='<p class="match-title">活用候補は判定保留</p><p>今回は音楽的な拍を十分に確認できませんでした。用途を無理に推測しません。</p>';$('matchList').innerHTML='';}
 else{const [t,r,p,c,x]=data.values;const scores=[{name:'集中',score:.25*r+.25*(100-Math.abs(t-45))+.2*(100-c)+.15*(100-x)+.15*(100-Math.abs(p-40))},
 {name:'休息',score:.25*(100-t)+.15*r+.25*(100-p)+.2*(100-c)+.15*(100-x)},
 {name:'気分転換',score:.28*t+.17*r+.25*p+.2*c+.1*x}].sort((a,b)=>b.score-a.score);
 $('bestMatch').innerHTML=`<p class="match-title">${scores[0].name}の候補</p><p>音の特徴に基づく参考提案です。効果を保証するものではありません。</p>`;
 $('matchList').innerHTML=scores.map(s=>`<div class="match-row"><span>${s.name}</span><div class="track"><div class="fill" style="width:${clamp(s.score)}%"></div></div><strong>${grade(clamp(s.score))}</strong></div>`).join('');}
 show('result');window.scrollTo({top:0,behavior:'smooth'});}
/* Optional AI sound labels: never needed for the five acoustic measurements. */
const groups=[['🎵','音楽',['Music','Song','Dance music']],['🎤','歌声',['Singing','Choir','Humming']],['🗣️','話し声',['Speech','Conversation']],['👣','足音',['Walk, footsteps','Run']],['👏','拍手',['Clapping','Applause']],['🎹','ピアノ',['Piano']],['🎸','ギター',['Guitar']],['🎸','ベース',['Bass guitar']],['🥁','ドラム',['Drum','Cymbal','Percussion']],['🐶','犬',['Dog','Bark']],['🐱','猫',['Cat','Meow']],['🐦','鳥',['Bird','Chirp']],['🌧️','雨',['Rain']],['🚗','車',['Car','Traffic noise']],['🚆','電車',['Train']],['🏠','生活音',['Dishes','Door','Typing']],['👥','ざわめき',['Crowd','Hubbub']]];
function soundCard(){let c=$('soundDetectionCard');if(c)return c;c=document.createElement('section');c.id='soundDetectionCard';c.className='card';c.style.marginTop='18px';const chart=document.querySelector('#result .chart-card');chart.parentNode.insertBefore(c,chart.nextSibling);return c;}
function showSound(message,q){soundCard().innerHTML=`<h3>この録音で検出された音</h3><p>録音：${q.duration}秒／${q.label}</p><p>${message}</p>`;}
let classifierPromise=null;
function script(url){return new Promise((ok,fail)=>{const s=document.createElement('script');s.src=url;s.onload=ok;s.onerror=fail;document.head.appendChild(s);});}
async function getClassifier(){if(classifierPromise)return classifierPromise;classifierPromise=(async()=>{
 await script('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.20/audio_bundle.js');
 if(!window.FilesetResolver||!window.AudioClassifier)throw Error('音認識ライブラリが使えません');
 const fs=await window.FilesetResolver.forAudioTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.20/wasm');
 return window.AudioClassifier.createFromOptions(fs,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite'},maxResults:40,scoreThreshold:.03});})();
 return classifierPromise.catch(e=>{classifierPromise=null;throw e;});}
async function classifySound(buffer,id,q){try{const model=await Promise.race([getClassifier(),new Promise((_,reject)=>setTimeout(()=>reject(Error('読み込み時間超過')),5000))]);if(id!==run)return;
 // Downsample to 16 kHz for YAMNet, using a short excerpt to reduce phone load.
 const raw=buffer.getChannelData(0),rate=buffer.sampleRate,length=Math.min(5*16000,Math.floor(raw.length*16000/rate)),audio=new Float32Array(length);
 for(let i=0;i<length;i++)audio[i]=raw[Math.min(raw.length-1,Math.floor(i*rate/16000))];
 const result=model.classify(audio,16000),labels=[];for(const r of result||[])for(const c of r.classifications||[])for(const x of c.categories||[])labels.push({name:x.categoryName||x.displayName||'',score:x.score||0});
 const found=[];for(const [icon,name,words] of groups){const m=labels.filter(x=>words.some(w=>x.name.toLowerCase().includes(w.toLowerCase()))).sort((a,b)=>b.score-a.score)[0];if(m&&m.score>=.25)found.push({icon,name,score:m.score});}
 if(id!==run)return;showSound(found.length?found.sort((a,b)=>b.score-a.score).map(x=>`<p>${x.icon} ${x.name}（検出候補）</p>`).join('')+'<small>AIによる推定であり誤検出する場合があります。</small>':'明確に分類できる音はありませんでした。',q);
 }catch(e){console.warn('音の種類の分類',e);if(id===run)showSound('音の種類は判定できませんでした。五角形の分析には影響ありません。',q);}}
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});
