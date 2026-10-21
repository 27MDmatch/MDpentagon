
/* MDpentagon - complete standalone app.js (2026-10-21) */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const labels = ['リズム', 'ハーモニー', 'メロディ', '音色', '強弱'];
  const descriptions = [
    '音の立ち上がりがどれくらい規則的か',
    '同時に響く音の豊かさの目安（推定）',
    '音の高さの動きの目安（推定）',
    '高音域と低音域の響きのバランス',
    '音量の大小がどれくらい変化するか'
  ];
  const clamp = (x, a=0, b=100) => Math.max(a, Math.min(b, Number.isFinite(x) ? x : a));
  const mean = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0;
  const std = a => { const m=mean(a); return Math.sqrt(mean(a.map(x=>(x-m)**2))); };
  const quantile = (a,p) => { if(!a.length) return 0; const b=[...a].sort((x,y)=>x-y); const v=(b.length-1)*p; const i=Math.floor(v); return b[i]+((b[i+1]??b[i])-b[i])*(v-i); };
  const pages=['intro','recording','analyzing','result'];
  const show = id => pages.forEach(p => $(p)?.classList.toggle('hidden',p!==id));
  let stream=null, recorder=null, chunks=[], startTime=0, ticker=null, stopping=false;
  let audioContext=null;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  // Frame-based features. These are acoustical proxies, not transcription.
  function extract(buffer) {
    const x=buffer.getChannelData(0), sr=buffer.sampleRate;
    const hop=Math.max(128,Math.round(sr*0.025));
    const size=Math.max(512,Math.round(sr*0.05));
    const rms=[], zcr=[], low=[], mid=[], high=[], pitches=[], clarity=[];
    // Goertzel energies at representative frequencies; avoids a heavy FFT dependency.
    const freqs=[110,165,220,330,440,660,880,1320,2000,3200,5000];
    const count=Math.max(0,Math.floor((x.length-size)/hop)+1);
    const stride=Math.max(1,Math.ceil(count/500));
    for(let frame=0;frame<count;frame+=stride){
      const off=frame*hop; let power=0,cross=0;
      for(let i=0;i<size;i++) { const v=x[off+i]; power+=v*v; if(i && (v>=0)!==(x[off+i-1]>=0))cross++; }
      const level=Math.sqrt(power/size); rms.push(level); zcr.push(cross/size);
      const energies=freqs.map(freq=>{
        const w=2*Math.PI*freq/sr, coeff=2*Math.cos(w);
        let s0=0,s1=0,s2=0;
        for(let i=0;i<size;i+=2){ s0=x[off+i]+coeff*s1-s2; s2=s1;s1=s0; }
        return Math.max(0,s1*s1+s2*s2-coeff*s1*s2);
      });
      low.push(energies.slice(0,4).reduce((a,b)=>a+b,0));
      mid.push(energies.slice(4,8).reduce((a,b)=>a+b,0));
      high.push(energies.slice(8).reduce((a,b)=>a+b,0));
      const total=energies.reduce((a,b)=>a+b,0)+1e-12;
      const max=Math.max(...energies); const k=energies.indexOf(max);
      pitches.push(level>0.006 && max/total>0.19 ? Math.log2(freqs[k]/110)*12 : null);
      clarity.push(max/total);
    }
    return {rms,zcr,low,mid,high,pitches,clarity,frameStep:hop*stride/sr};
  }

  function estimatePulse(f) {
    const levels=f.rms, dt=f.frameStep;
    if(levels.length<25)return {bpm:null,confidence:0,regularity:0};
    const onset=levels.map((v,i)=>i?Math.max(0,v-levels[i-1]):0);
    const mu=mean(onset), sd=std(onset);
    const signal=onset.map(v=>Math.max(0,v-mu*0.6));
    const minLag=Math.max(1,Math.round(60/190/dt));
    const maxLag=Math.min(signal.length-3,Math.round(60/65/dt));
    let best={lag:0,score:0};
    const energy=signal.reduce((s,v)=>s+v*v,0)+1e-10;
    for(let lag=minLag;lag<=maxLag;lag++) {
      let corr=0;
      for(let i=lag;i<signal.length;i++)corr+=signal[i]*signal[i-lag];
      const score=corr/(energy*(1-lag/signal.length)+1e-10);
      if(score>best.score)best={lag,score};
    }
    const bpm=best.lag?Math.round(60/(best.lag*dt)):null;
    const confidence=clamp(best.score,0,1);
    // The rhythm score depends on repeatability, NOT bpm itself.
    return {bpm:confidence>0.11?bpm:null,confidence,regularity:confidence,activity:clamp((mu+sd)/(mean(levels)+1e-6)*80,0,1)};
  }

  function analyzeAudio(buffer) {
    const data=buffer.getChannelData(0); let sum=0,peak=0;
    const step=Math.max(1,Math.floor(data.length/50000));let n=0;
    for(let i=0;i<data.length;i+=step){const v=data[i];sum+=v*v;peak=Math.max(peak,Math.abs(v));n++;}
    const rawRms=Math.sqrt(sum/Math.max(n,1));
    const silent=rawRms<0.00012&&peak<0.0007;
    if(silent)return {values:[null,null,null,null,null],tempo:{bpm:null,confidence:0},quality:{duration:buffer.duration.toFixed(1),label:'ほぼ無音'},silent:true};
    // Analysis-level normalization prevents the phone's microphone volume from determining scores.
    const gain=clamp(0.085/(rawRms+1e-9),0.25,16);
    const normalized=audioContext.createBuffer(1,data.length,buffer.sampleRate);
    const dest=normalized.getChannelData(0);
    for(let i=0;i<data.length;i++)dest[i]=Math.max(-1,Math.min(1,data[i]*gain));
    const f=extract(normalized), pulse=estimatePulse(f);
    const volume=mean(f.rms), p10=quantile(f.rms,0.1),p90=quantile(f.rms,0.9);
    const bandSum=f.low.map((v,i)=>v+f.mid[i]+f.high[i]+1e-10);
    const brightness=mean(f.high.map((v,i)=>v/bandSum[i]));
    const fullness=mean(f.mid.map((v,i)=>v/bandSum[i]));
    const valid=f.pitches.filter(v=>v!==null);
    const movement=valid.length>2?mean(valid.slice(1).map((v,i)=>Math.min(12,Math.abs(v-valid[i]))))/12:0;
    const tonalConfidence=mean(f.clarity);
    const values=[
      clamp(20+72*pulse.regularity+10*pulse.activity),
      clamp(22+85*fullness+15*(1-tonalConfidence)),
      clamp(18+72*movement+18*tonalConfidence),
      clamp(15+105*brightness+18*std(f.zcr)),
      clamp(18+34*Math.log2(1+(p90-p10)/(volume+0.003)))
    ];
    return {values,tempo:pulse,quality:{duration:buffer.duration.toFixed(1),label:peak>0.98?'音割れの可能性':'録音できました'},silent:false};
  }

  function radar(values){
    const canvas=$('radar');if(!canvas)return;
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
    ctx.clearRect(0,0,w,h);
    const cx=w/2,cy=h/2+12,r=Math.min(w,h)*0.32;
    const pt=(i,scale)=>{const a=-Math.PI/2+i*2*Math.PI/5;return [cx+Math.cos(a)*r*scale,cy+Math.sin(a)*r*scale];};
    for(let level=1;level<=5;level++){
      ctx.beginPath();for(let i=0;i<5;i++){const [x,y]=pt(i,level/5);i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();
      ctx.strokeStyle='#ded7ef';ctx.lineWidth=2;ctx.stroke();
    }
    for(let i=0;i<5;i++){const [x,y]=pt(i,1);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(x,y);ctx.strokeStyle='#e8e2f1';ctx.stroke();}
    ctx.beginPath();values.forEach((v,i)=>{const [x,y]=pt(i,(v??0)/100);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();
    ctx.fillStyle='rgba(114,87,255,.24)';ctx.fill();ctx.strokeStyle='#7257ff';ctx.lineWidth=5;ctx.stroke();
    ctx.fillStyle='#41366b';ctx.font='bold 25px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    labels.forEach((label,i)=>{const [x,y]=pt(i,1.2);ctx.fillText(label,x,y);});
  }
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function render(result){
    const {values,tempo,quality,silent}=result;
    radar(values);
    $('metricList').innerHTML=labels.map((label,i)=>`<div class="metric-row" style="padding:12px 0;border-bottom:1px solid #eee"><div style="display:flex;justify-content:space-between;gap:12px"><strong>${esc(label)}</strong><strong>${values[i]===null?'判定不可':Math.round(values[i])+' / 100'}</strong></div><div style="height:8px;background:#eae5f5;border-radius:20px;margin:7px 0"><div style="height:100%;width:${values[i]??0}%;background:#7257ff;border-radius:20px"></div></div><small>${esc(descriptions[i])}</small></div>`).join('');
    const summary=silent?'音が小さすぎるため分析できませんでした。別の音を録音してください。':
      `録音時間 ${quality.duration}秒／${quality.label}。${tempo.bpm?'推定BPM '+tempo.bpm+'。':'BPMは安定して推定できませんでした。'} 各数値は録音区間の音響的な特徴の目安です。`;
    $('bestMatch').textContent=summary;
    if(silent){$('matchList').textContent='';return;}
    const pairs=values.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v);
    const hints=[
      '拍のまとまりを感じやすい部分です。軽い運動や歩行中の試聴候補。',
      '音の重なりが比較的豊かに聞こえる可能性があります。鑑賞候補。',
      '音高の動きが感じられる可能性があります。メロディを楽しむ候補。',
      '高域の響きが目立つ傾向があります。音色を楽しむ候補。',
      '音量の変化が比較的大きい部分です。メリハリを楽しむ候補。'
    ];
    $('matchList').innerHTML=pairs.slice(0,3).map(({i})=>`<div style="padding:10px 0;border-bottom:1px solid #eee"><strong>${esc(labels[i])}</strong><div>${esc(hints[i])}</div></div>`).join('');
  }
  function stopTracks(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}}
  function reset(){clearInterval(ticker);ticker=null;stopTracks();recorder=null;chunks=[];stopping=false;$('seconds').textContent='0';$('stopBtn').disabled=true;show('intro');}
  async function start(){
    try{
      if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('このブラウザは録音に対応していません。');
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      chunks=[];stopping=false;
      recorder=new MediaRecorder(stream);
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onstop=async()=>{
        clearInterval(ticker);ticker=null;stopTracks();show('analyzing');
        try{
          const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});
          audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();
          const buffer=await audioContext.decodeAudioData(await blob.arrayBuffer());
          await sleep(150);render(analyzeAudio(buffer));show('result');
        }catch(err){alert('音声の分析に失敗しました。もう一度録音してください。\n'+err.message);reset();}
      };
      recorder.start(250);startTime=Date.now();show('recording');
      $('seconds').textContent='0';$('stopBtn').disabled=true;
      ticker=setInterval(()=>{
        const seconds=(Date.now()-startTime)/1000;
        $('seconds').textContent=String(Math.floor(seconds));
        $('stopBtn').disabled=seconds<8;
        if(seconds>=20)stop();
      },150);
    }catch(err){stopTracks();alert('マイクを利用できませんでした。HTTPSとマイクの許可を確認してください。\n'+err.message);reset();}
  }
  function stop(){if(stopping||!recorder||recorder.state!=='recording')return;stopping=true;clearInterval(ticker);recorder.stop();}
  $('startBtn')?.addEventListener('click',start);
  $('stopBtn')?.addEventListener('click',stop);
  $('retryBtn')?.addEventListener('click',reset);
  $('retryTop')?.addEventListener('click',reset);
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  show('intro');
})();
