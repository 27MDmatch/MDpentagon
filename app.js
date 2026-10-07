const $ = (id) => document.getElementById(id);
const sections = ['intro','recording','analyzing','result'];
const show = (id) => sections.forEach(s => $(s).classList.toggle('hidden', s !== id));

let stream, recorder, audioCtx, analyser, source, timerId, animationId;
let chunks = [], samples = [], spectra = [], startedAt = 0;

let soundClassifier = null;
let soundModelPromise = null;

const MEDIAPIPE_VERSION = '0.10.20';
const MEDIAPIPE_BUNDLE =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@${MEDIAPIPE_VERSION}/audio_bundle.js`;
const MEDIAPIPE_WASM =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@${MEDIAPIPE_VERSION}/wasm`;
const YAMNET_MODEL =
  'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite';

const metricInfo = [
  ['テンポ感','音の速さ・拍の細かさ'],
  ['リズムの規則性','一定のリズムが続く度合い'],
  ['音の強さ','音量と音の力強さ'],
  ['変化の大きさ','静かな部分と強い部分の差'],
  ['音の複雑さ','同時に含まれる音の広がり']
];

const soundGroups = [
  {
    name: '音楽',
    icon: '🎵',
    patterns: [
      'Music',
      'Musical instrument',
      'Song',
      'Background music',
      'Theme music',
      'Soundtrack music',
      'Dance music',
      'Vocal music'
    ],
    threshold: 0.22
  },
  {
    name: 'ポップス',
    icon: '🎶',
    patterns: ['Pop music'],
    threshold: 0.20
  },
  {
    name: '歌声',
    icon: '🎤',
    patterns: [
      'Singing',
      'Choir',
      'Child singing',
      'Yodeling',
      'Rapping',
      'Humming',
      'A capella'
    ],
    threshold: 0.20
  },
  {
    name: '話し声',
    icon: '🗣️',
    patterns: [
      'Speech',
      'Conversation',
      'Narration',
      'monologue',
      'Chatter'
    ],
    threshold: 0.22
  },
  {
    name: 'ざわめき・周囲の会話',
    icon: '👥',
    patterns: [
      'Hubbub, speech noise, speech babble',
      'Crowd',
      'Environmental noise'
    ],
    threshold: 0.20
  },
  {
    name: '足音',
    icon: '👣',
    patterns: [
      'Walk, footsteps',
      'Run',
      'Shuffle'
    ],
    threshold: 0.20
  },
  {
    name: '拍手・手拍子',
    icon: '👏',
    patterns: [
      'Clapping',
      'Applause',
      'Cheering'
    ],
    threshold: 0.20
  },

  /* 楽器 */
  {
    name: 'ピアノ',
    icon: '🎹',
    patterns: [
      'Piano',
      'Electric piano'
    ],
    threshold: 0.20
  },
  {
    name: 'ギター',
    icon: '🎸',
    patterns: [
      'Guitar',
      'Electric guitar',
      'Acoustic guitar',
      'Steel guitar',
      'Strum',
      'Tapping (guitar technique)'
    ],
    threshold: 0.20
  },
  {
    name: 'ベース',
    icon: '🎸',
    patterns: [
      'Bass guitar'
    ],
    threshold: 0.20
  },
  {
    name: 'ドラム・打楽器',
    icon: '🥁',
    patterns: [
      'Drum kit',
      'Drum machine',
      'Drum',
      'Snare drum',
      'Bass drum',
      'Drum roll',
      'Rimshot',
      'Cymbal',
      'Hi-hat',
      'Percussion',
      'Tambourine',
      'Maraca'
    ],
    threshold: 0.20
  },
  {
    name: 'シンセサイザー',
    icon: '🎛️',
    patterns: [
      'Synthesizer',
      'Electronic organ',
      'Organ',
      'Sampler'
    ],
    threshold: 0.20
  },
  {
    name: 'バイオリン',
    icon: '🎻',
    patterns: [
      'Violin, fiddle'
    ],
    threshold: 0.20
  },
  {
    name: 'チェロ',
    icon: '🎻',
    patterns: [
      'Cello'
    ],
    threshold: 0.20
  },
  {
    name: 'フルート',
    icon: '🪈',
    patterns: [
      'Flute'
    ],
    threshold: 0.20
  },
  {
    name: 'サックス',
    icon: '🎷',
    patterns: [
      'Saxophone'
    ],
    threshold: 0.20
  },
  {
    name: 'トランペット',
    icon: '🎺',
    patterns: [
      'Trumpet'
    ],
    threshold: 0.20
  },

  /* 自然・動物 */
  {
    name: '犬',
    icon: '🐶',
    patterns: [
      'Dog',
      'Bark',
      'Yip',
      'Howl',
      'Bow-wow',
      'Growling'
    ],
    threshold: 0.20
  },
  {
    name: '猫',
    icon: '🐱',
    patterns: [
      'Cat',
      'Purr',
      'Meow',
      'Hiss',
      'Caterwaul'
    ],
    threshold: 0.20
  },
  {
    name: '鳥',
    icon: '🐦',
    patterns: [
      'Bird',
      'Bird vocalization',
      'Bird call',
      'Bird song',
      'Chirp, tweet',
      'Squawk',
      'Pigeon, dove',
      'Coo',
      'Crow',
      'Caw',
      'Owl',
      'Hoot'
    ],
    threshold: 0.20
  },
  {
    name: '馬',
    icon: '🐴',
    patterns: [
      'Horse',
      'Clip-clop',
      'Neigh, whinny'
    ],
    threshold: 0.20
  },
  {
    name: '牛',
    icon: '🐮',
    patterns: [
      'Cattle, bovinae',
      'Moo',
      'Cowbell'
    ],
    threshold: 0.20
  },
  {
    name: '豚',
    icon: '🐷',
    patterns: [
      'Pig',
      'Oink'
    ],
    threshold: 0.20
  },
  {
    name: 'カエル',
    icon: '🐸',
    patterns: [
      'Frog',
      'Croak'
    ],
    threshold: 0.20
  },
  {
    name: '昆虫',
    icon: '🦗',
    patterns: [
      'Insect',
      'Cricket',
      'Mosquito',
      'Fly, housefly',
      'Buzz',
      'Bee, wasp, etc.'
    ],
    threshold: 0.20
  },

  /* 環境音 */
  {
    name: '雨',
    icon: '🌧️',
    patterns: [
      'Rain',
      'Raindrop',
      'Rain on surface'
    ],
    threshold: 0.20
  },
  {
    name: '風',
    icon: '🌬️',
    patterns: [
      'Wind',
      'Wind noise (microphone)',
      'Rustling leaves'
    ],
    threshold: 0.20
  },
  {
    name: '車',
    icon: '🚗',
    patterns: [
      'Car',
      'Motor vehicle (road)',
      'Traffic noise, roadway noise',
      'Car passing by',
      'Vehicle horn'
    ],
    threshold: 0.20
  },
  {
    name: '電車',
    icon: '🚆',
    patterns: [
      'Train',
      'Train whistle',
      'Train horn',
      'Rail transport',
      'Subway, metro, underground'
    ],
    threshold: 0.20
  },
  {
    name: '生活音',
    icon: '🏠',
    patterns: [
      'Dishes, pots, and pans',
      'Cutlery, silverware',
      'Door',
      'Doorbell',
      'Typing',
      'Computer keyboard',
      'Keys jangling',
      'Vacuum cleaner',
      'Hair dryer',
      'Blender',
      'Microwave oven',
      'Zipper (clothing)',
      'Scissors'
    ],
    threshold: 0.20
  }
];

const bars = Array.from({length:30}, () => {
  const el = document.createElement('i');
  el.className = 'bar';
  $('bars').appendChild(el);
  return el;
});

/* =========================
   音検出カードのデザイン
========================= */

function injectSoundStyles(){
  if($('mdpentagon-sound-styles')) return;

  const style = document.createElement('style');
  style.id = 'mdpentagon-sound-styles';

  style.textContent = `
    .sound-detection-card{
      margin-top:18px;
      padding:24px;
      border-radius:28px;
      background:#fff;
      box-shadow:0 12px 30px rgba(70,55,130,.07);
    }

    .sound-detection-head{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      margin-bottom:8px;
    }

    .sound-detection-head h3{
      margin:0;
      font-size:25px;
    }

    .sound-detection-sub{
      margin:0 0 18px;
      color:#77718a;
      line-height:1.6;
      font-size:14px;
    }

    .sound-quality{
      padding:14px 16px;
      margin-bottom:16px;
      border-radius:18px;
      background:#f7f5ff;
      color:#514b68;
      font-size:14px;
      line-height:1.6;
    }

    .sound-list{
      display:flex;
      flex-direction:column;
      gap:10px;
    }

    .sound-item{
      display:grid;
      grid-template-columns:46px 1fr auto;
      gap:12px;
      align-items:center;
      padding:14px;
      border:1px solid #ece8f7;
      border-radius:18px;
      background:#fff;
    }

    .sound-item-icon{
      width:42px;
      height:42px;
      display:grid;
      place-items:center;
      border-radius:14px;
      background:#f3efff;
      font-size:23px;
    }

    .sound-item-main{
      min-width:0;
    }

    .sound-item-title{
      font-weight:800;
      font-size:16px;
      margin-bottom:5px;
    }

    .sound-item-source{
      font-size:12px;
      line-height:1.4;
      color:#8a8499;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }

    .sound-item-score{
      min-width:52px;
      text-align:right;
      font-weight:900;
      color:#7257ff;
      font-size:17px;
    }

    .sound-item-bar{
      margin-top:8px;
      height:7px;
      border-radius:999px;
      background:#eeeaf8;
      overflow:hidden;
    }

    .sound-item-fill{
      height:100%;
      border-radius:999px;
      background:linear-gradient(90deg,#55d7bd,#7257ff,#ff6fae);
    }

    .sound-empty{
      padding:18px;
      border-radius:18px;
      background:#faf9fd;
      color:#77718a;
      line-height:1.7;
    }

    .sound-loading{
      padding:18px;
      border-radius:18px;
      background:#faf9fd;
      color:#77718a;
      line-height:1.7;
    }

    @media (max-width:600px){
      .sound-detection-card{
        padding:20px;
      }

      .sound-item{
        grid-template-columns:42px 1fr auto;
      }
    }
  `;

  document.head.appendChild(style);
}

function ensureSoundSection(){
  injectSoundStyles();

  let card = $('soundDetectionCard');
  if(card) return card;

  card = document.createElement('section');
  card.id = 'soundDetectionCard';
  card.className = 'sound-detection-card';

  const chart = document.querySelector('#result .chart-card');

  if(chart && chart.parentNode){
    chart.parentNode.insertBefore(card, chart.nextSibling);
  }else{
    $('result').appendChild(card);
  }

  return card;
}

/* =========================
   MediaPipe / YAMNet
========================= */

function loadScriptOnce(src){
  return new Promise((resolve,reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);

    if(existing){
      if(window.AudioClassifier && window.FilesetResolver){
        resolve();
        return;
      }

      existing.addEventListener('load', resolve, {once:true});
      existing.addEventListener('error', reject, {once:true});
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('MediaPipeの読み込みに失敗しました'));
    document.head.appendChild(script);
  });
}

async function loadSoundClassifier(){
  if(soundClassifier) return soundClassifier;

  if(soundModelPromise) return soundModelPromise;

  soundModelPromise = (async() => {
    try{
      if(!window.AudioClassifier || !window.FilesetResolver){
        await loadScriptOnce(MEDIAPIPE_BUNDLE);
      }

      if(!window.AudioClassifier || !window.FilesetResolver){
        throw new Error('AudioClassifierが読み込まれていません');
      }

      const audio = await window.FilesetResolver.forAudioTasks(
        MEDIAPIPE_WASM
      );

      soundClassifier = await window.AudioClassifier.createFromOptions(audio,{
        baseOptions:{
          modelAssetPath:YAMNET_MODEL
        },
        runningMode:'AUDIO_CLIPS',
        maxResults:40,
        scoreThreshold:0.03
      });

      return soundClassifier;

    }catch(err){
      console.warn('音イベントAIを読み込めませんでした',err);
      soundClassifier = null;
      soundModelPromise = null;
      return null;
    }
  })();

  return soundModelPromise;
}

/* 録音した音をAIに見せる */

async function detectSounds(decoded){
  if(!decoded){
    return {
      items:[],
      status:'音声データを読み込めませんでした'
    };
  }

  const classifier = await loadSoundClassifier();

  if(!classifier){
    return {
      items:[],
      status:'音の種類を分析するAIを読み込めませんでした。5つの音響分析は通常どおり行っています。'
    };
  }

  try{
    const waveform = decoded.getChannelData(0);

    const results = classifier.classify(
      waveform,
      decoded.sampleRate
    );

    const rawMap = new Map();

    for(const result of results || []){
      const categories =
        result?.classifications?.[0]?.categories || [];

      for(const category of categories){
        const label =
          category.displayName ||
          category.categoryName ||
          '';

        const score = Number(category.score) || 0;

        if(!label) continue;

        if(!rawMap.has(label)){
          rawMap.set(label,{
            label,
            scores:[]
          });
        }

        rawMap.get(label).scores.push(score);
      }
    }

    const groupResults = new Map();

    for(const group of soundGroups){

      const matched = [];

      for(const data of rawMap.values()){

        const lower = data.label.toLowerCase();

        const hit = group.patterns.some(
          pattern => lower.includes(pattern.toLowerCase())
        );

        if(!hit) continue;

        const scores = [...data.scores].sort((a,b)=>b-a);

        const max = scores[0] || 0;

        const topCount = Math.max(
          1,
          Math.ceil(scores.length * 0.25)
        );

        const topMean =
          scores.slice(0,topCount).reduce((a,b)=>a+b,0) /
          topCount;

        /*
          一瞬だけ鳴った音も拾いつつ、
          一回だけの誤検出は出にくくする。
        */
        const combined =
          (max * 0.55) +
          (topMean * 0.45);

        matched.push({
          label:data.label,
          score:combined
        });
      }

      if(!matched.length) continue;

      matched.sort((a,b)=>b.score-a.score);

      const best = matched[0];
      const score = Math.round(
        clamp(best.score * 100)
      );

      if(score < group.threshold * 100) continue;

      if(
        !groupResults.has(group.name) ||
        score > groupResults.get(group.name).score
      ){
        groupResults.set(
          group.name,
          {
            name:group.name,
            icon:group.icon,
            score,
            sources:matched
              .slice(0,2)
              .map(x=>x.label)
          }
        );
      }
    }

    const items = [...groupResults.values()]
      .sort((a,b)=>b.score-a.score)
      .slice(0,10);

    return {
      items,
      status:
        items.length
          ? `${items.length}種類の音の特徴が検出されました`
          : '今回の録音から明確な音イベントを検出できませんでした'
    };

  }catch(err){
    console.warn('音イベント分析に失敗しました',err);

    return {
      items:[],
      status:'音の種類の分析中にエラーが起きました。'
    };
  }
}

/* =========================
   録音品質
========================= */

function calculateRecordingQuality(decoded){
  if(!decoded){
    return {
      label:'確認できません',
      message:'録音データを解析できませんでした。'
    };
  }

  const data = decoded.getChannelData(0);
  const duration = decoded.duration;

  let sum = 0;
  let count = 0;
  let clipped = 0;

  const step = Math.max(
    1,
    Math.floor(data.length / 12000)
  );

  for(
    let i=0;
    i<data.length;
    i+=step
  ){
    const v = data[i];
    sum += v * v;
    count++;

    if(Math.abs(v) > 0.98){
      clipped++;
    }
  }

  const rms = Math.sqrt(sum / Math.max(1,count));
  const clipRatio =
    clipped / Math.max(1,count);

  let frame = Math.floor(
    decoded.sampleRate * 0.05
  );

  frame = Math.max(1,frame);

  let silenceCount = 0;
  let totalFrames = 0;

  const silenceThreshold =
    Math.max(0.0025,rms * 0.06);

  for(
    let start=0;
    start + frame < data.length;
    start += frame
  ){
    let power = 0;
    let n = 0;

    for(
      let i=start;
      i<start+frame;
      i+=4
    ){
      const v=data[i];
      power += v*v;
      n++;
    }

    const localRms =
      Math.sqrt(power / Math.max(1,n));

    if(localRms < silenceThreshold){
      silenceCount++;
    }

    totalFrames++;
  }

  const silenceRatio =
    silenceCount / Math.max(1,totalFrames);

  let label = '良好';
  let message =
    '録音された音量と長さは分析に十分です。';

  if(duration < 8){
    label = '短め';
    message =
      '録音時間が短いため、判定が不安定になる可能性があります。';
  }else if(clipRatio > 0.08){
    label = '音割れに注意';
    message =
      '音が大きすぎて一部が音割れしている可能性があります。';
  }else if(silenceRatio > 0.75){
    label = '無音が多め';
    message =
      '録音の中に静かな部分が多いため、音の種類が検出されにくい可能性があります。';
  }else if(rms < 0.002){
    label = '音が小さめ';
    message =
      '録音された音が小さいため、別の端末やスピーカーで少し音量を上げると分析しやすくなります。';
  }

  return {
    label,
    message,
    duration:Number(duration.toFixed(1))
  };
}

/* =========================
   検出結果を表示
========================= */

function renderSoundDetections(soundData,quality){

  const card = ensureSoundSection();

  const items = soundData?.items || [];

  const qualityHtml = quality
    ? `
      <div class="sound-quality">
        <strong>録音品質：${quality.label}</strong><br>
        ${quality.message}
        ${quality.duration ? `（${quality.duration}秒を分析）` : ''}
      </div>
    `
    : '';

  if(!items.length){

    card.innerHTML = `
      <div class="sound-detection-head">
        <h3>この録音で検出された音</h3>
      </div>

      <p class="sound-detection-sub">
        録音された音をAIが分類し、検出できた音だけを表示します。
      </p>

      ${qualityHtml}

      <div class="sound-empty">
        ${soundData?.status || '明確な音イベントを検出できませんでした。'}
      </div>
    `;

    return;
  }

  const list = items.map(item => {

    const sources = item.sources?.join(' / ') || '';

    return `
      <div class="sound-item">

        <div class="sound-item-icon">
          ${item.icon}
        </div>

        <div class="sound-item-main">

          <div class="sound-item-title">
            ${item.name}
          </div>

          <div class="sound-item-source">
            AIが反応した音：${sources}
          </div>

          <div class="sound-item-bar">
            <div
              class="sound-item-fill"
              style="width:${item.score}%"
            ></div>
          </div>

        </div>

        <div class="sound-item-score">
          ${item.score}%
        </div>

      </div>
    `;
  }).join('');

  card.innerHTML = `
    <div class="sound-detection-head">
      <h3>この録音で検出された音</h3>
    </div>

    <p class="sound-detection-sub">
      録音された音をAIが分類し、検出できた音だけを表示しています。
      複数の音が重なっている場合は、それぞれ表示されます。
    </p>

    ${qualityHtml}

    <div class="sound-list">
      ${list}
    </div>
  `;
}

/* =========================
   録音
========================= */

$('startBtn').addEventListener(
  'click',
  startRecording
);

$('stopBtn').addEventListener(
  'click',
  stopRecording
);

$('retryBtn').addEventListener(
  'click',
  reset
);

$('retryTop').addEventListener(
  'click',
  reset
);

async function startRecording(){

  try{

    stream =
      await navigator.mediaDevices.getUserMedia({
        audio:{
          echoCancellation:false,
          noiseSuppression:false,
          autoGainControl:false
        }
      });

    audioCtx =
      new (window.AudioContext ||
        window.webkitAudioContext)();

    await audioCtx.resume();

    source =
      audioCtx.createMediaStreamSource(stream);

    analyser =
      audioCtx.createAnalyser();

    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = .25;

    source.connect(analyser);

    recorder =
      new MediaRecorder(stream);

    chunks=[];
    samples=[];
    spectra=[];

    recorder.ondataavailable =
      e => {
        if(e.data.size){
          chunks.push(e.data);
        }
      };

    recorder.onstop = analyze;

    recorder.start(250);

    startedAt =
      performance.now();

    $('seconds').textContent='0';
    $('stopBtn').disabled=true;

    const analysisText =
      document.querySelector('#analyzing p');

    if(analysisText){
      analysisText.textContent =
        '音の特徴と、録音された音の種類を分析しています';
    }

    /*
      録音中にAIの準備を始める。
      15秒録音している間にモデルを読み込めれば、
      停止後の待ち時間を短くできる。
    */
    loadSoundClassifier();

    show('recording');

    timerId =
      setInterval(
        updateTimer,
        200
      );

    visualize();

  }catch(err){

    alert(
      'マイクを使用できませんでした。ブラウザの設定でマイクを許可して、もう一度お試しください。'
    );

    cleanup();
    show('intro');
  }
}

function updateTimer(){

  const sec =
    (performance.now()-startedAt)/1000;

  $('seconds').textContent =
    Math.floor(sec);

  $('stopBtn').disabled =
    sec < 8;

  $('recordHint').textContent =
    sec < 8
      ? `あと${Math.ceil(8-sec)}秒で分析できます`
      : '好きなタイミングで分析できます';

  if(sec>=20){
    stopRecording();
  }
}

function visualize(){

  if(!analyser) return;

  const time =
    new Uint8Array(
      analyser.fftSize
    );

  const freq =
    new Uint8Array(
      analyser.frequencyBinCount
    );

  analyser.getByteTimeDomainData(time);
  analyser.getByteFrequencyData(freq);

  let sum=0;

  for(const v of time){

    const x =
      (v-128)/128;

    sum += x*x;
  }

  const rms =
    Math.sqrt(
      sum/time.length
    );

  samples.push({
    t:performance.now()-startedAt,
    rms
  });

  let weighted=0;
  let total=0;
  let active=0;

  for(
    let i=1;
    i<freq.length;
    i++
  ){

    const p =
      freq[i]/255;

    weighted += i*p;
    total += p;

    if(p>.12){
      active++;
    }
  }

  spectra.push({
    centroid:
      total
        ? weighted/total/freq.length
        : 0,
    spread:
      active/freq.length
  });

  bars.forEach((b,i)=>{

    const idx =
      Math.floor(
        i*freq.length/bars.length
      );

    b.style.height =
      `${Math.max(
        7,
        Math.min(
          88,
          7+freq[idx]*.32
        )
      )}px`;
  });

  animationId =
    requestAnimationFrame(
      visualize
    );
}

function stopRecording(){

  if(
    !recorder ||
    recorder.state==='inactive'
  ){
    return;
  }

  clearInterval(timerId);
  cancelAnimationFrame(animationId);

  recorder.stop();
  show('analyzing');
}

/* =========================
   分析
========================= */

async function analyze(){

  const blob =
    new Blob(
      chunks,
      {type:recorder.mimeType}
    );

  let decoded;

  try{

    decoded =
      await audioCtx.decodeAudioData(
        await blob.arrayBuffer()
      );

  }catch(e){

    decoded = null;
  }

  const metrics =
    calculateMetrics(decoded);

  const quality =
    calculateRecordingQuality(decoded);

  const soundData =
    await detectSounds(decoded);

  setTimeout(
    () => renderResults({
      ...metrics,
      quality,
      sounds:soundData
    }),
    500
  );
}

function clamp(
  v,
  min=0,
  max=100
){
  return Math.max(
    min,
    Math.min(max,v)
  );
}

function mean(a){

  return a.length
    ? a.reduce(
        (x,y)=>x+y,
        0
      )/a.length
    : 0;
}

function std(a){

  const m=mean(a);

  return Math.sqrt(
    mean(
      a.map(
        x=>(x-m)**2
      )
    )
  );
}

function calculateMetrics(decoded){

  let env =
    samples.map(
      x=>x.rms
    );

  if(decoded){

    const data =
      decoded.getChannelData(0);

    const rate =
      decoded.sampleRate;

    const frame =
      Math.floor(rate*.05);

    env=[];

    for(
      let i=0;
      i+frame<data.length;
      i+=frame
    ){

      let s=0;

      for(
        let j=0;
        j<frame;
        j+=4
      ){
        s +=
          data[i+j]**2;
      }

      env.push(
        Math.sqrt(
          s/(frame/4)
        )
      );
    }
  }

  const avg=mean(env);

  const variability =
    avg
      ? std(env)/avg
      : 0;

  const sorted =
    [...env].sort(
      (a,b)=>a-b
    );

  const p10 =
    sorted[
      Math.floor(sorted.length*.1)
    ] || 0;

  const p90 =
    sorted[
      Math.floor(sorted.length*.9)
    ] || 0;

  const power =
    clamp(
      (20*Math.log10(
        avg+1e-6
      )+55)*2.2
    );

  const change =
    clamp(
      ((p90-p10)/
        (avg+.0001))*42
    );

  const complexity =
    clamp(
      (
        mean(
          spectra.map(
            x=>x.spread
          )
        )-.03
      )*260
      +
      mean(
        spectra.map(
          x=>x.centroid
        )
      )*38
    );

  const tempoData =
    estimateTempo(
      env,
      20
    );

  const tempo =
    clamp(
      (tempoData.bpm-55)/1.15
    );

  const regularity =
    clamp(
      tempoData.confidence*115
      -
      variability*12
      +
      16
    );

  return {
    values:[
      tempo,
      regularity,
      power,
      change,
      complexity
    ].map(Math.round),

    bpm:
      Math.round(
        tempoData.bpm
      )
  };
}

function estimateTempo(
  env,
  fps
){

  if(env.length<80){

    return {
      bpm:90,
      confidence:.35
    };
  }

  const smooth =
    env.map(
      (_,i)=>
        mean(
          env.slice(
            Math.max(0,i-1),
            i+2
          )
        )
    );

  const onset =
    smooth.map(
      (v,i)=>
        Math.max(
          0,
          v-(smooth[i-1]||v)
        )
    );

  const minLag =
    Math.floor(
      fps*60/180
    );

  const maxLag =
    Math.ceil(
      fps*60/55
    );

  let bestLag =
    Math.round(
      fps*60/100
    );

  let best=-1;
  let total=0;

  for(
    let lag=minLag;
    lag<=maxLag;
    lag++
  ){

    let c=0;

    for(
      let i=lag;
      i<onset.length;
      i++
    ){

      c +=
        onset[i]*
        onset[i-lag];
    }

    total += c;

    if(c>best){

      best=c;
      bestLag=lag;
    }
  }

  return {
    bpm:
      clamp(
        60*fps/bestLag,
        55,
        180
      ),

    confidence:
      total
        ? best/
          (
            total/
              (
                maxLag-minLag+1
              )
            +
            1e-9
          )/5
        : .3
  };
}

/* =========================
   結果表示
========================= */

function renderResults(data){

  cleanup();

  drawRadar(
    data.values
  );

  /*
    ここで「検出された音」を
    五角形とは別の結果として表示。
  */
  renderSoundDetections(
    data.sounds,
    data.quality
  );

  $('metricList').innerHTML =
    data.values.map(
      (v,i)=>
        `
        <div class="metric">

          <div class="metric-top">
            <span>
              ${metricInfo[i][0]}
            </span>

            <strong>
              ${v}
            </strong>
          </div>

          <div class="track">
            <div
              class="fill"
              style="width:${v}%"
            ></div>
          </div>

          <small>
            ${
              i===0
                ? `推定テンポ：約${data.bpm} BPM`
                : metricInfo[i][1]
            }
          </small>

        </div>
        `
    ).join('');

  const matches =
    scoreMatches(
      data.values
    );

  const best =
    matches[0];

  $('bestMatch').innerHTML =
    `
    <p class="match-title">
      ${best.icon}
      ${best.name}の候補
    </p>

    <p>
      ${best.reason}
    </p>
    `;

  $('matchList').innerHTML =
    matches.map(
      m=>
        `
        <div class="match-row">

          <span>
            ${m.name}
          </span>

          <div class="track">
            <div
              class="fill"
              style="width:${m.score}%"
            ></div>
          </div>

          <strong>
            ${m.score}
          </strong>

        </div>
        `
    ).join('');

  show('result');

  window.scrollTo({
    top:0,
    behavior:'smooth'
  });
}

/* =========================
   現在の活用候補
========================= */

function scoreMatches(v){

  const [
    tempo,
    regular,
    power,
    change,
    complex
  ]=v;

  const proximity =
    (x,target)=>
      100-Math.abs(
        x-target
      );

  const list=[

    {
      name:'集中',
      icon:'✎',

      score:
        .20*proximity(
          tempo,45
        )
        +
        .30*regular
        +
        .20*proximity(
          power,38
        )
        +
        .18*(100-change)
        +
        .12*(100-complex),

      reason:
        '一定の流れと控えめな変化は、作業中の背景音候補になります。歌詞が気になる場合は器楽曲も試してみましょう。'
    },

    {
      name:'休息',
      icon:'☾',

      score:
        .28*(100-tempo)
        +
        .12*regular
        +
        .25*(100-power)
        +
        .22*(100-change)
        +
        .13*(100-complex),

      reason:
        '穏やかな速さと音量、変化の少なさは、休憩時間に気持ちを落ち着けたい時の候補になります。'
    },

    {
      name:'気分転換',
      icon:'↗',

      score:
        .27*tempo
        +
        .12*regular
        +
        .26*power
        +
        .23*change
        +
        .12*complex,

      reason:
        'テンポ感や音の力、展開の変化は、休憩後や活動前に気持ちを切り替えたい時の候補になります。'
    }

  ];

  return list
    .map(
      x=>({
        ...x,
        score:
          Math.round(
            clamp(x.score)
          )
      })
    )
    .sort(
      (a,b)=>b.score-a.score
    );
}

/* =========================
   レーダーチャート
========================= */

function drawRadar(values){

  const c =
    $('radar');

  const ctx =
    c.getContext('2d');

  const cx =
    c.width/2;

  const cy =
    c.height/2+10;

  const R=205;

  ctx.clearRect(
    0,
    0,
    c.width,
    c.height
  );

  const point =
    (i,r)=>{

      const a =
        -Math.PI/2
        +
        i*Math.PI*2/5;

      return [
        cx+Math.cos(a)*r,
        cy+Math.sin(a)*r
      ];
    };

  for(
    let level=1;
    level<=4;
    level++
  ){

    ctx.beginPath();

    for(
      let i=0;
      i<5;
      i++
    ){

      const p =
        point(
          i,
          R*level/4
        );

      i
        ? ctx.lineTo(...p)
        : ctx.moveTo(...p);
    }

    ctx.closePath();

    ctx.strokeStyle =
      '#e5e0f7';

    ctx.lineWidth=2;

    ctx.stroke();
  }

  for(
    let i=0;
    i<5;
    i++
  ){

    const p =
      point(i,R);

    ctx.beginPath();

    ctx.moveTo(cx,cy);

    ctx.lineTo(...p);

    ctx.strokeStyle =
      '#ebe7f7';

    ctx.stroke();
  }

  const grad =
    ctx.createLinearGradient(
      cx-R,
      cy-R,
      cx+R,
      cy+R
    );

  grad.addColorStop(
    0,
    '#55d7bd99'
  );

  grad.addColorStop(
    .5,
    '#7257ff99'
  );

  grad.addColorStop(
    1,
    '#ff6fae99'
  );

  ctx.beginPath();

  values.forEach(
    (v,i)=>{

      const p =
        point(
          i,
          R*v/100
        );

      i
        ? ctx.lineTo(...p)
        : ctx.moveTo(...p);
    }
  );

  ctx.closePath();

  ctx.fillStyle=grad;
  ctx.fill();

  ctx.strokeStyle =
    '#7257ff';

  ctx.lineWidth=6;
  ctx.lineJoin='round';

  ctx.stroke();

  values.forEach(
    (v,i)=>{

      const p =
        point(
          i,
          R*v/100
        );

      ctx.beginPath();

      ctx.arc(
        ...p,
        8,
        0,
        Math.PI*2
      );

      ctx.fillStyle='#fff';
      ctx.fill();

      ctx.strokeStyle =
        '#7257ff';

      ctx.lineWidth=5;

      ctx.stroke();
    }
  );

  ctx.textAlign='center';
  ctx.textBaseline='middle';

  ctx.fillStyle =
    '#353148';

  ctx.font =
    '700 24px -apple-system, sans-serif';

  const labels=[
    'テンポ感',
    '規則性',
    '音の強さ',
    '変化',
    '複雑さ'
  ];

  labels.forEach(
    (label,i)=>{

      const p =
        point(
          i,
          R+50
        );

      ctx.fillText(
        label,
        p[0],
        p[1]
      );

      ctx.fillStyle =
        '#7257ff';

      ctx.font =
        '800 22px -apple-system, sans-serif';

      ctx.fillText(
        values[i],
        p[0],
        p[1]+27
      );

      ctx.fillStyle =
        '#353148';

      ctx.font =
        '700 24px -apple-system, sans-serif';
    }
  );
}

/* =========================
   後片付け
========================= */

function cleanup(){

  clearInterval(timerId);

  cancelAnimationFrame(
    animationId
  );

  if(stream){
    stream
      .getTracks()
      .forEach(
        t=>t.stop()
      );
  }

  if(
    audioCtx &&
    audioCtx.state!=='closed'
  ){
    audioCtx
      .close()
      .catch(()=>{});
  }

  stream=null;
  recorder=null;
  audioCtx=null;
  analyser=null;
  source=null;
}

function reset(){

  cleanup();

  show('intro');

  window.scrollTo({
    top:0,
    behavior:'smooth'
  });
}

if(
  'serviceWorker' in navigator &&
  location.protocol.startsWith('http')
){
  navigator.serviceWorker
    .register('sw.js')
    .catch(()=>{});
}