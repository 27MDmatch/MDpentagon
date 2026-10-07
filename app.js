const $ = (id) => document.getElementById(id);
const sections = ['intro', 'recording', 'analyzing', 'result'];
const show = (id) =>
  sections.forEach((s) => $(s).classList.toggle('hidden', s !== id));

let stream = null;
let recorder = null;
let audioCtx = null;
let analyser = null;
let source = null;
let timerId = null;
let animationId = null;

let chunks = [];
let samples = [];
let spectra = [];
let startedAt = 0;

const metricInfo = [
  ['テンポ感', '音の速さ・拍の細かさ'],
  ['リズムの規則性', '一定のリズムが続く度合い'],
  ['音の強さ', '音量と音の力強さ'],
  ['変化の大きさ', '静かな部分と強い部分の差'],
  ['音の複雑さ', '同時に含まれる音の広がり']
];

const bars = Array.from({ length: 30 }, () => {
  const el = document.createElement('i');
  el.className = 'bar';
  $('bars').appendChild(el);
  return el;
});

/* =========================
   音の種類
========================= */

const soundGroups = [
  {
    name: '音楽',
    icon: '🎵',
    words: [
      'Music',
      'Background music',
      'Song',
      'Vocal music',
      'Dance music',
      'Pop music'
    ]
  },
  {
    name: '歌声',
    icon: '🎤',
    words: [
      'Singing',
      'Choir',
      'Humming',
      'Rapping',
      'A capella'
    ]
  },
  {
    name: '話し声',
    icon: '🗣️',
    words: [
      'Speech',
      'Conversation',
      'Narration',
      'Chatter',
      'Monologue'
    ]
  },
  {
    name: '足音',
    icon: '👣',
    words: [
      'Walk, footsteps',
      'Footsteps',
      'Run',
      'Shuffle'
    ]
  },
  {
    name: '拍手・手拍子',
    icon: '👏',
    words: [
      'Clapping',
      'Applause',
      'Cheering'
    ]
  },
  {
    name: 'ピアノ',
    icon: '🎹',
    words: [
      'Piano',
      'Electric piano'
    ]
  },
  {
    name: 'ギター',
    icon: '🎸',
    words: [
      'Guitar',
      'Electric guitar',
      'Acoustic guitar'
    ]
  },
  {
    name: 'ベース',
    icon: '🎸',
    words: [
      'Bass guitar'
    ]
  },
  {
    name: 'ドラム・打楽器',
    icon: '🥁',
    words: [
      'Drum',
      'Drum kit',
      'Drum machine',
      'Snare drum',
      'Bass drum',
      'Cymbal',
      'Hi-hat',
      'Percussion',
      'Tambourine'
    ]
  },
  {
    name: 'シンセサイザー',
    icon: '🎛️',
    words: [
      'Synthesizer',
      'Sampler'
    ]
  },
  {
    name: 'バイオリン',
    icon: '🎻',
    words: [
      'Violin, fiddle'
    ]
  },
  {
    name: 'フルート',
    icon: '🪈',
    words: [
      'Flute'
    ]
  },
  {
    name: 'サックス',
    icon: '🎷',
    words: [
      'Saxophone'
    ]
  },
  {
    name: 'トランペット',
    icon: '🎺',
    words: [
      'Trumpet'
    ]
  },
  {
    name: '犬',
    icon: '🐶',
    words: [
      'Dog',
      'Bark',
      'Howl',
      'Growling'
    ]
  },
  {
    name: '猫',
    icon: '🐱',
    words: [
      'Cat',
      'Purr',
      'Meow',
      'Hiss'
    ]
  },
  {
    name: '鳥',
    icon: '🐦',
    words: [
      'Bird',
      'Bird vocalization',
      'Bird call',
      'Bird song',
      'Chirp, tweet',
      'Squawk',
      'Crow',
      'Owl'
    ]
  },
  {
    name: '雨',
    icon: '🌧️',
    words: [
      'Rain',
      'Raindrop'
    ]
  },
  {
    name: '風',
    icon: '🌬️',
    words: [
      'Wind',
      'Rustling leaves'
    ]
  },
  {
    name: '車',
    icon: '🚗',
    words: [
      'Car',
      'Motor vehicle',
      'Traffic noise',
      'Vehicle horn'
    ]
  },
  {
    name: '電車',
    icon: '🚆',
    words: [
      'Train',
      'Train whistle',
      'Train horn',
      'Rail transport',
      'Subway'
    ]
  },
  {
    name: '生活音',
    icon: '🏠',
    words: [
      'Dishes',
      'Cutlery',
      'Door',
      'Doorbell',
      'Typing',
      'Computer keyboard',
      'Keys jangling',
      'Vacuum cleaner',
      'Hair dryer'
    ]
  }
];

/* =========================
   音検出UI
========================= */

function injectSoundStyles() {
  if ($('mdpentagon-sound-styles')) return;

  const style = document.createElement('style');
  style.id = 'mdpentagon-sound-styles';

  style.textContent = `
    .sound-detection-card {
      margin-top: 18px;
      padding: 24px;
      border-radius: 28px;
      background: #fff;
      box-shadow: 0 12px 30px rgba(70,55,130,.07);
    }

    .sound-detection-card h3 {
      margin: 0 0 8px;
      font-size: 25px;
    }

    .sound-detection-sub {
      margin: 0 0 18px;
      color: #77718a;
      line-height: 1.6;
      font-size: 14px;
    }

    .sound-quality {
      padding: 14px 16px;
      margin-bottom: 16px;
      border-radius: 18px;
      background: #f7f5ff;
      color: #514b68;
      font-size: 14px;
      line-height: 1.6;
    }

    .sound-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .sound-item {
      display: grid;
      grid-template-columns: 46px 1fr auto;
      gap: 12px;
      align-items: center;
      padding: 14px;
      border: 1px solid #ece8f7;
      border-radius: 18px;
      background: #fff;
    }

    .sound-item-icon {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border-radius: 14px;
      background: #f3efff;
      font-size: 23px;
    }

    .sound-item-main {
      min-width: 0;
    }

    .sound-item-title {
      font-weight: 800;
      font-size: 16px;
      margin-bottom: 5px;
    }

    .sound-item-source {
      font-size: 12px;
      line-height: 1.4;
      color: #8a8499;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sound-item-bar {
      margin-top: 8px;
      height: 7px;
      border-radius: 999px;
      background: #eeeaf8;
      overflow: hidden;
    }

    .sound-item-fill {
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(
        90deg,
        #55d7bd,
        #7257ff,
        #ff6fae
      );
    }

    .sound-item-score {
      min-width: 52px;
      text-align: right;
      font-weight: 900;
      color: #7257ff;
      font-size: 17px;
    }

    .sound-loading,
    .sound-empty {
      padding: 18px;
      border-radius: 18px;
      background: #faf9fd;
      color: #77718a;
      line-height: 1.7;
    }
  `;

  document.head.appendChild(style);
}

function ensureSoundSection() {
  injectSoundStyles();

  let card = $('soundDetectionCard');

  if (card) return card;

  card = document.createElement('section');
  card.id = 'soundDetectionCard';
  card.className = 'sound-detection-card';

  const detailCard =
    document.querySelector('#result .detail-card');

  if (detailCard && detailCard.parentNode) {
    detailCard.parentNode.insertBefore(
      card,
      detailCard.nextSibling
    );
  } else {
    $('result').appendChild(card);
  }

  return card;
}

/* =========================
   MediaPipe AI
========================= */

let soundClassifier = null;
let soundClassifierPromise = null;

const MEDIAPIPE_VERSION = '0.10.20';

const MP_BUNDLE =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@${MEDIAPIPE_VERSION}/audio_bundle.js`;

const MP_WASM =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@${MEDIAPIPE_VERSION}/wasm`;

const YAMNET =
  'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite';

function timeoutPromise(ms) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), ms);
  });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing =
      document.querySelector(`script[src="${src}"]`);

    if (existing) {
      if (
        window.AudioClassifier &&
        window.FilesetResolver
      ) {
        resolve();
        return;
      }

      existing.addEventListener(
        'load',
        resolve,
        { once: true }
      );

      existing.addEventListener(
        'error',
        reject,
        { once: true }
      );

      return;
    }

    const script =
      document.createElement('script');

    script.src = src;
    script.crossOrigin = 'anonymous';

    script.onload = resolve;
    script.onerror = reject;

    document.head.appendChild(script);
  });
}

async function loadSoundClassifier() {
  if (soundClassifier) {
    return soundClassifier;
  }

  if (soundClassifierPromise) {
    return soundClassifierPromise;
  }

  soundClassifierPromise =
    (async () => {

      try {

        await loadScript(MP_BUNDLE);

        if (
          !window.AudioClassifier ||
          !window.FilesetResolver
        ) {
          throw new Error(
            'MediaPipe Audio Classifier unavailable'
          );
        }

        const audioFileset =
          await window.FilesetResolver.forAudioTasks(
            MP_WASM
          );

        soundClassifier =
          await window.AudioClassifier.createFromOptions(
            audioFileset,
            {
              baseOptions: {
                modelAssetPath: YAMNET,
                delegate: 'CPU'
              },
              maxResults: 40,
              scoreThreshold: 0.03
            }
          );

        return soundClassifier;

      } catch (error) {

        console.warn(
          '音イベントAIの初期化に失敗しました',
          error
        );

        soundClassifier = null;
        return null;
      }
    })();

  return soundClassifierPromise;
}

/* =========================
   音の種類を分析
   ※ここは絶対にメイン分析を止めない
========================= */

async function detectSounds(decoded) {

  if (!decoded) {
    return [];
  }

  const classifier =
    await Promise.race([
      loadSoundClassifier(),
      timeoutPromise(5000)
    ]);

  if (!classifier) {
    return [];
  }

  try {

    const source =
      decoded.getChannelData(0);

    /*
      長すぎる録音をそのまま送らず、
      最大20秒まで。
    */
    const maxSamples =
      Math.min(
        source.length,
        decoded.sampleRate * 20
      );

    const audioData =
      source.slice(
        0,
        maxSamples
      );

    const results =
      classifier.classify(
        audioData,
        decoded.sampleRate
      );

    const raw = [];

    for (const result of results || []) {

      const categories =
        result?.classifications?.[0]?.categories ||
        [];

      for (const category of categories) {

        const label =
          category.displayName ||
          category.categoryName ||
          '';

        const score =
          Number(category.score) || 0;

        if (!label) continue;

        raw.push({
          label,
          score
        });
      }
    }

    const groups = [];

    for (const group of soundGroups) {

      const matched =
        raw.filter((item) => {

          const label =
            item.label.toLowerCase();

          return group.words.some(
            (word) =>
              label.includes(
                word.toLowerCase()
              )
          );
        });

      if (!matched.length) continue;

      matched.sort(
        (a, b) =>
          b.score - a.score
      );

      const best =
        matched[0];

      const percent =
        Math.round(
          Math.max(
            0,
            Math.min(
              100,
              best.score * 100
            )
          )
        );

      /*
        「ちょっと反応した」だけでは
        結果に出さない。
      */
      if (percent < 20) continue;

      groups.push({
        name: group.name,
        icon: group.icon,
        score: percent,
        source: best.label
      });
    }

    return groups
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .slice(0, 10);

  } catch (error) {

    console.warn(
      '音イベント分析エラー',
      error
    );

    return [];
  }
}

/* =========================
   録音品質
========================= */

function calculateRecordingQuality(decoded) {

  if (!decoded) {

    return {
      label: '確認できません',
      message: '録音データを読み込めませんでした。'
    };
  }

  const data =
    decoded.getChannelData(0);

  let sum = 0;
  let count = 0;
  let clipped = 0;

  const step =
    Math.max(
      1,
      Math.floor(
        data.length / 10000
      )
    );

  for (
    let i = 0;
    i < data.length;
    i += step
  ) {

    const v = data[i];

    sum += v * v;
    count++;

    if (Math.abs(v) > 0.98) {
      clipped++;
    }
  }

  const rms =
    Math.sqrt(
      sum / Math.max(1, count)
    );

  const clipRatio =
    clipped /
    Math.max(1, count);

  if (decoded.duration < 8) {

    return {
      label: '短め',
      message:
        '録音時間が短いため、判定が不安定になる可能性があります。',
      duration:
        Number(
          decoded.duration.toFixed(1)
        )
    };
  }

  if (clipRatio > 0.08) {

    return {
      label: '音割れに注意',
      message:
        '音が大きすぎる可能性があります。少し音量を下げて録音すると分析しやすくなります。',
      duration:
        Number(
          decoded.duration.toFixed(1)
        )
    };
  }

  if (rms < 0.002) {

    return {
      label: '音が小さめ',
      message:
        '録音された音が小さいため、別の端末やスピーカーで少し音量を上げると分析しやすくなります。',
      duration:
        Number(
          decoded.duration.toFixed(1)
        )
    };
  }

  return {
    label: '良好',
    message:
      '録音された音量と長さは分析に十分です。',
    duration:
      Number(
        decoded.duration.toFixed(1)
      )
  };
}

function renderSoundDetections(
  sounds,
  quality
) {

  const card =
    ensureSoundSection();

  const qualityHtml = quality
    ? `
      <div class="sound-quality">
        <strong>
          録音品質：${quality.label}
        </strong>
        <br>
        ${quality.message}
        ${
          quality.duration
            ? `（${quality.duration}秒を分析）`
            : ''
        }
      </div>
    `
    : '';

  if (!sounds.length) {

    card.innerHTML = `
      <h3>この録音で検出された音</h3>

      <p class="sound-detection-sub">
        録音された音をAIが分析し、
        検出できた音だけを表示します。
      </p>

      ${qualityHtml}

      <div class="sound-empty">
        今回は音の種類を十分に検出できませんでした。
        5つの音響分析結果は通常どおり表示されています。
      </div>
    `;

    return;
  }

  const list =
    sounds
      .map(
        (item) => `
          <div class="sound-item">

            <div class="sound-item-icon">
              ${item.icon}
            </div>

            <div class="sound-item-main">

              <div class="sound-item-title">
                ${item.name}
              </div>

              <div class="sound-item-source">
                AIが検出した音：${item.source}
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
        `
      )
      .join('');

  card.innerHTML = `
    <h3>この録音で検出された音</h3>

    <p class="sound-detection-sub">
      録音された音の中から、AIが検出したものを表示しています。
      複数の音が重なっている場合もあります。
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

async function startRecording() {

  try {

    stream =
      await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

    audioCtx =
      new (
        window.AudioContext ||
        window.webkitAudioContext
      )();

    await audioCtx.resume();

    source =
      audioCtx.createMediaStreamSource(
        stream
      );

    analyser =
      audioCtx.createAnalyser();

    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.25;

    source.connect(analyser);

    recorder =
      new MediaRecorder(stream);

    chunks = [];
    samples = [];
    spectra = [];

    recorder.ondataavailable =
      (e) => {
        if (e.data.size) {
          chunks.push(e.data);
        }
      };

    recorder.onstop = analyze;

    recorder.start(250);

    startedAt =
      performance.now();

    $('seconds').textContent = '0';
    $('stopBtn').disabled = true;

    show('recording');

    timerId =
      setInterval(
        updateTimer,
        200
      );

    visualize();

    /*
      AIはここで先読みする。
      ただし待たない。
    */
    loadSoundClassifier().catch(() => {});

  } catch (error) {

    alert(
      'マイクを使用できませんでした。ブラウザの設定でマイクを許可してください。'
    );

    cleanup();
    show('intro');
  }
}

function updateTimer() {

  const sec =
    (performance.now() - startedAt) /
    1000;

  $('seconds').textContent =
    Math.floor(sec);

  $('stopBtn').disabled =
    sec < 8;

  $('recordHint').textContent =
    sec < 8
      ? `あと${Math.ceil(8 - sec)}秒で分析できます`
      : '好きなタイミングで分析できます';

  if (sec >= 20) {
    stopRecording();
  }
}

function visualize() {

  if (!analyser) return;

  const time =
    new Uint8Array(
      analyser.fftSize
    );

  const freq =
    new Uint8Array(
      analyser.frequencyBinCount
    );

  analyser.getByteTimeDomainData(
    time
  );

  analyser.getByteFrequencyData(
    freq
  );

  let sum = 0;

  for (const v of time) {

    const x =
      (v - 128) / 128;

    sum += x * x;
  }

  const rms =
    Math.sqrt(
      sum / time.length
    );

  samples.push({
    t:
      performance.now() -
      startedAt,
    rms
  });

  let weighted = 0;
  let total = 0;
  let active = 0;

  for (
    let i = 1;
    i < freq.length;
    i++
  ) {

    const p =
      freq[i] / 255;

    weighted += i * p;
    total += p;

    if (p > 0.12) {
      active++;
    }
  }

  spectra.push({
    centroid:
      total
        ? weighted /
          total /
          freq.length
        : 0,
    spread:
      active /
      freq.length
  });

  bars.forEach(
    (bar, i) => {

      const index =
        Math.floor(
          i *
          freq.length /
          bars.length
        );

      bar.style.height =
        `${Math.max(
          7,
          Math.min(
            88,
            7 + freq[index] * 0.32
          )
        )}px`;
    }
  );

  animationId =
    requestAnimationFrame(
      visualize
    );
}

function stopRecording() {

  if (
    !recorder ||
    recorder.state === 'inactive'
  ) {
    return;
  }

  clearInterval(timerId);
  cancelAnimationFrame(
    animationId
  );

  recorder.stop();

  show('analyzing');
}

/* =========================
   分析
========================= */

async function analyze() {

  const mime =
    recorder?.mimeType ||
    'audio/webm';

  const blob =
    new Blob(
      chunks,
      { type: mime }
    );

  let decoded = null;

  try {

    decoded =
      await audioCtx.decodeAudioData(
        await blob.arrayBuffer()
      );

  } catch (error) {

    decoded = null;
  }

  const metrics =
    calculateMetrics(
      decoded
    );

  const quality =
    calculateRecordingQuality(
      decoded
    );

  /*
    ★ここが今回の重要ポイント
    音イベントAIを待たずに
    まず結果画面を出す。
  */
  renderResults({
    ...metrics,
    quality
  });

  /*
    音の種類は裏側で分析。
    最大6秒待つ。
    失敗しても五角形結果には影響なし。
  */
  Promise.race([
    detectSounds(decoded),
    timeoutPromise(6000)
  ]).then(
    (sounds) => {

      if (!Array.isArray(sounds)) {
        sounds = [];
      }

      renderSoundDetections(
        sounds,
        quality
      );
    }
  );
}

function clamp(
  value,
  min = 0,
  max = 100
) {

  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );
}

function mean(array) {

  return array.length
    ? array.reduce(
        (a, b) => a + b,
        0
      ) / array.length
    : 0;
}

function std(array) {

  const m =
    mean(array);

  return Math.sqrt(
    mean(
      array.map(
        (x) =>
          (x - m) ** 2
      )
    )
  );
}

function calculateMetrics(decoded) {

  let env =
    samples.map(
      (x) => x.rms
    );

  if (decoded) {

    const data =
      decoded.getChannelData(0);

    const rate =
      decoded.sampleRate;

    const frame =
      Math.floor(
        rate * 0.05
      );

    env = [];

    for (
      let i = 0;
      i + frame < data.length;
      i += frame
    ) {

      let power = 0;

      let count = 0;

      for (
        let j = 0;
        j < frame;
        j += 4
      ) {

        const v =
          data[i + j];

        power +=
          v * v;

        count++;
      }

      env.push(
        Math.sqrt(
          power /
          Math.max(1, count)
        )
      );
    }
  }

  const avg =
    mean(env);

  const variability =
    avg
      ? std(env) / avg
      : 0;

  const sorted =
    [...env].sort(
      (a, b) => a - b
    );

  const p10 =
    sorted[
      Math.floor(
        sorted.length * 0.1
      )
    ] || 0;

  const p90 =
    sorted[
      Math.floor(
        sorted.length * 0.9
      )
    ] || 0;

  const power =
    clamp(
      (
        20 *
        Math.log10(
          avg + 1e-6
        ) +
        55
      ) *
      2.2
    );

  const change =
    clamp(
      (
        (p90 - p10) /
        (avg + 0.0001)
      ) *
      42
    );

  const complexity =
    clamp(
      (
        mean(
          spectra.map(
            (x) =>
              x.spread
          )
        ) -
        0.03
      ) *
      260
      +
      mean(
        spectra.map(
          (x) =>
            x.centroid
        )
      ) *
      38
    );

  const tempoData =
    estimateTempo(
      env,
      20
    );

  const tempo =
    clamp(
      (
        tempoData.bpm -
        55
      ) /
      1.15
    );

  const regularity =
    clamp(
      tempoData.confidence *
        115 -
        variability *
        12 +
        16
    );

  return {
    values: [
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
) {

  if (
    env.length < 80
  ) {

    return {
      bpm: 90,
      confidence: 0.35
    };
  }

  const smooth =
    env.map(
      (_, i) =>
        mean(
          env.slice(
            Math.max(
              0,
              i - 1
            ),
            i + 2
          )
        )
    );

  const onset =
    smooth.map(
      (value, i) =>
        Math.max(
          0,
          value -
            (
              smooth[i - 1] ||
              value
            )
        )
    );

  const minLag =
    Math.floor(
      fps * 60 / 180
    );

  const maxLag =
    Math.ceil(
      fps * 60 / 55
    );

  let bestLag =
    Math.round(
      fps * 60 / 100
    );

  let best = -1;
  let total = 0;

  for (
    let lag = minLag;
    lag <= maxLag;
    lag++
  ) {

    let correlation = 0;

    for (
      let i = lag;
      i < onset.length;
      i++
    ) {

      correlation +=
        onset[i] *
        onset[i - lag];
    }

    total +=
      correlation;

    if (
      correlation >
      best
    ) {

      best =
        correlation;

      bestLag =
        lag;
    }
  }

  return {
    bpm:
      clamp(
        60 * fps / bestLag,
        55,
        180
      ),

    confidence:
      total
        ? best /
          (
            total /
            (
              maxLag -
              minLag +
              1
            ) +
            1e-9
          ) /
          5
        : 0.3
  };
}

/* =========================
   結果表示
========================= */

function renderResults(data) {

  cleanup();

  drawRadar(
    data.values
  );

  $('metricList').innerHTML =
    data.values
      .map(
        (value, i) => `
          <div class="metric">

            <div class="metric-top">

              <span>
                ${metricInfo[i][0]}
              </span>

              <strong>
                ${value}
              </strong>

            </div>

            <div class="track">

              <div
                class="fill"
                style="width:${value}%"
              ></div>

            </div>

            <small>
              ${
                i === 0
                  ? `推定テンポ：約${data.bpm} BPM`
                  : metricInfo[i][1]
              }
            </small>

          </div>
        `
      )
      .join('');

  const matches =
    scoreMatches(
      data.values
    );

  const best =
    matches[0];

  $('bestMatch').innerHTML = `
    <p class="match-title">
      ${best.icon}
      ${best.name}の候補
    </p>

    <p>
      ${best.reason}
    </p>
  `;

  $('matchList').innerHTML =
    matches
      .map(
        (match) => `
          <div class="match-row">

            <span>
              ${match.name}
            </span>

            <div class="track">

              <div
                class="fill"
                style="width:${match.score}%"
              ></div>

            </div>

            <strong>
              ${match.score}
            </strong>

          </div>
        `
      )
      .join('');

  ensureSoundSection();

  $('soundDetectionCard').innerHTML = `
    <h3>この録音で検出された音</h3>

    <p class="sound-detection-sub">
      録音された音をAIが分析しています…
    </p>

    <div class="sound-loading">
      五角形の分析結果は先に表示しています。
      音の種類の分析が完了すると、ここに検出された音が表示されます。
    </div>
  `;

  show('result');

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

/* =========================
   活用候補
========================= */

function scoreMatches(values) {

  const [
    tempo,
    regular,
    power,
    change,
    complex
  ] = values;

  const proximity =
    (value, target) =>
      Math.max(
        0,
        100 -
          Math.abs(
            value - target
          )
      );

  const list = [

    {
      name: '集中',
      icon: '✎',

      score:
        0.20 *
          proximity(
            tempo,
            45
          )
        +
        0.30 *
          regular
        +
        0.20 *
          proximity(
            power,
            38
          )
        +
        0.18 *
          (100 - change)
        +
        0.12 *
          (100 - complex),

      reason:
        '一定の流れと控えめな変化は、作業中の背景音候補になります。歌詞が気になる場合は器楽曲も試してみましょう。'
    },

    {
      name: '休息',
      icon: '☾',

      score:
        0.28 *
          (100 - tempo)
        +
        0.12 *
          regular
        +
        0.25 *
          (100 - power)
        +
        0.22 *
          (100 - change)
        +
        0.13 *
          (100 - complex),

      reason:
        '穏やかな速さと音量、変化の少なさは、休憩時間に気持ちを落ち着けたい時の候補になります。'
    },

    {
      name: '気分転換',
      icon: '↗',

      score:
        0.27 *
          tempo
        +
        0.12 *
          regular
        +
        0.26 *
          power
        +
        0.23 *
          change
        +
        0.12 *
          complex,

      reason:
        'テンポ感や音の力、展開の変化は、活動前や気分を切り替えたい時の候補になります。'
    }

  ];

  return list
    .map(
      (item) => ({
        ...item,

        score:
          Math.round(
            clamp(
              item.score
            )
          )
      })
    )
    .sort(
      (a, b) =>
        b.score -
        a.score
    );
}

/* =========================
   五角形
========================= */

function drawRadar(values) {

  const canvas =
    $('radar');

  const ctx =
    canvas.getContext('2d');

  const cx =
    canvas.width / 2;

  const cy =
    canvas.height / 2 + 10;

  const radius = 205;

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  const point =
    (index, r) => {

      const angle =
        -Math.PI / 2 +
        index *
          Math.PI *
          2 /
          5;

      return [
        cx +
          Math.cos(angle) *
          r,

        cy +
          Math.sin(angle) *
          r
      ];
    };

  for (
    let level = 1;
    level <= 4;
    level++
  ) {

    ctx.beginPath();

    for (
      let i = 0;
      i < 5;
      i++
    ) {

      const p =
        point(
          i,
          radius *
            level /
            4
        );

      if (i === 0) {
        ctx.moveTo(
          ...p
        );
      } else {
        ctx.lineTo(
          ...p
        );
      }
    }

    ctx.closePath();

    ctx.strokeStyle =
      '#e5e0f7';

    ctx.lineWidth = 2;

    ctx.stroke();
  }

  for (
    let i = 0;
    i < 5;
    i++
  ) {

    const p =
      point(
        i,
        radius
      );

    ctx.beginPath();

    ctx.moveTo(
      cx,
      cy
    );

    ctx.lineTo(
      ...p
    );

    ctx.strokeStyle =
      '#ebe7f7';

    ctx.stroke();
  }

  const gradient =
    ctx.createLinearGradient(
      cx - radius,
      cy - radius,
      cx + radius,
      cy + radius
    );

  gradient.addColorStop(
    0,
    '#55d7bd99'
  );

  gradient.addColorStop(
    0.5,
    '#7257ff99'
  );

  gradient.addColorStop(
    1,
    '#ff6fae99'
  );

  ctx.beginPath();

  values.forEach(
    (value, i) => {

      const p =
        point(
          i,
          radius *
            value /
            100
        );

      if (i === 0) {
        ctx.moveTo(
          ...p
        );
      } else {
        ctx.lineTo(
          ...p
        );
      }
    }
  );

  ctx.closePath();

  ctx.fillStyle =
    gradient;

  ctx.fill();

  ctx.strokeStyle =
    '#7257ff';

  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';

  ctx.stroke();

  values.forEach(
    (value, i) => {

      const p =
        point(
          i,
          radius *
            value /
            100
        );

      ctx.beginPath();

      ctx.arc(
        ...p,
        8,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        '#fff';

      ctx.fill();

      ctx.strokeStyle =
        '#7257ff';

      ctx.lineWidth = 5;

      ctx.stroke();
    }
  );

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const labels = [
    'テンポ感',
    '規則性',
    '音の強さ',
    '変化',
    '複雑さ'
  ];

  labels.forEach(
    (label, i) => {

      const p =
        point(
          i,
          radius + 50
        );

      ctx.fillStyle =
        '#353148';

      ctx.font =
        '700 24px -apple-system, sans-serif';

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
        p[1] + 27
      );
    }
  );
}

/* =========================
   後片付け
========================= */

function cleanup() {

  clearInterval(
    timerId
  );

  cancelAnimationFrame(
    animationId
  );

  if (stream) {

    stream
      .getTracks()
      .forEach(
        (track) =>
          track.stop()
      );
  }

  if (
    audioCtx &&
    audioCtx.state !==
      'closed'
  ) {

    audioCtx
      .close()
      .catch(() => {});
  }

  stream = null;
  recorder = null;
  audioCtx = null;
  analyser = null;
  source = null;
}

function reset() {

  cleanup();

  show('intro');

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

/* =========================
   Service Worker
========================= */

if (
  'serviceWorker' in navigator &&
  location.protocol.startsWith('http')
) {

  navigator.serviceWorker
    .register('sw.js')
    .catch(() => {});
}