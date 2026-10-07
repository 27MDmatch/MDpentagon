const $ = (id) => document.getElementById(id);

const sections = [
  'intro',
  'recording',
  'analyzing',
  'result'
];

const show = (id) => {
  sections.forEach((section) => {
    $(section).classList.toggle(
      'hidden',
      section !== id
    );
  });
};

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

/* =========================================
   5つの音響分析項目
========================================= */

const metricInfo = [
  [
    'テンポ感',
    '音の速さ・拍の細かさ'
  ],
  [
    'リズムの規則性',
    '一定のリズムが続く度合い'
  ],
  [
    '音の強さ',
    '音量と音の力強さ'
  ],
  [
    '変化の大きさ',
    '静かな部分と強い部分の差'
  ],
  [
    '音の複雑さ',
    '同時に含まれる音の広がり'
  ]
];

/* =========================================
   AIで読み取ってほしい音
========================================= */

const soundGroups = [
  {
    name: '音楽',
    icon: '🎵',
    patterns: [
      'Music',
      'Song',
      'Background music',
      'Theme music',
      'Soundtrack music',
      'Dance music',
      'Vocal music',
      'Musical instrument'
    ]
  },

  {
    name: 'ポップス',
    icon: '🎶',
    patterns: [
      'Pop music'
    ]
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
    ]
  },

  {
    name: '話し声',
    icon: '🗣️',
    patterns: [
      'Speech',
      'Conversation',
      'Narration',
      'Monologue',
      'Chatter'
    ]
  },

  {
    name: 'ざわめき・周囲の会話',
    icon: '👥',
    patterns: [
      'Hubbub, speech noise, speech babble',
      'Crowd',
      'Environmental noise'
    ]
  },

  {
    name: '足音',
    icon: '👣',
    patterns: [
      'Walk, footsteps',
      'Footsteps',
      'Run',
      'Shuffle'
    ]
  },

  {
    name: '拍手・手拍子',
    icon: '👏',
    patterns: [
      'Clapping',
      'Applause',
      'Cheering'
    ]
  },

  {
    name: 'ピアノ',
    icon: '🎹',
    patterns: [
      'Piano',
      'Electric piano'
    ]
  },

  {
    name: 'ギター',
    icon: '🎸',
    patterns: [
      'Guitar',
      'Electric guitar',
      'Acoustic guitar',
      'Steel guitar',
      'Strum'
    ]
  },

  {
    name: 'ベース',
    icon: '🎸',
    patterns: [
      'Bass guitar'
    ]
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
    ]
  },

  {
    name: 'シンセサイザー',
    icon: '🎛️',
    patterns: [
      'Synthesizer',
      'Sampler',
      'Electronic organ',
      'Organ'
    ]
  },

  {
    name: 'バイオリン',
    icon: '🎻',
    patterns: [
      'Violin, fiddle'
    ]
  },

  {
    name: 'チェロ',
    icon: '🎻',
    patterns: [
      'Cello'
    ]
  },

  {
    name: 'フルート',
    icon: '🪈',
    patterns: [
      'Flute'
    ]
  },

  {
    name: 'サックス',
    icon: '🎷',
    patterns: [
      'Saxophone'
    ]
  },

  {
    name: 'トランペット',
    icon: '🎺',
    patterns: [
      'Trumpet'
    ]
  },

  {
    name: '犬',
    icon: '🐶',
    patterns: [
      'Dog',
      'Bark',
      'Yip',
      'Howl',
      'Growling',
      'Bow-wow'
    ]
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
    ]
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
      'Crow',
      'Caw',
      'Owl',
      'Hoot'
    ]
  },

  {
    name: '馬',
    icon: '🐴',
    patterns: [
      'Horse',
      'Clip-clop',
      'Neigh, whinny'
    ]
  },

  {
    name: '牛',
    icon: '🐮',
    patterns: [
      'Cattle, bovinae',
      'Moo',
      'Cowbell'
    ]
  },

  {
    name: '豚',
    icon: '🐷',
    patterns: [
      'Pig',
      'Oink'
    ]
  },

  {
    name: 'カエル',
    icon: '🐸',
    patterns: [
      'Frog',
      'Croak'
    ]
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
    ]
  },

  {
    name: '雨',
    icon: '🌧️',
    patterns: [
      'Rain',
      'Raindrop',
      'Rain on surface'
    ]
  },

  {
    name: '風',
    icon: '🌬️',
    patterns: [
      'Wind',
      'Wind noise (microphone)',
      'Rustling leaves'
    ]
  },

  {
    name: '車',
    icon: '🚗',
    patterns: [
      'Car',
      'Motor vehicle',
      'Traffic noise, roadway noise',
      'Car passing by',
      'Vehicle horn'
    ]
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
    ]
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
      'Zipper',
      'Scissors'
    ]
  }
];

/* =========================================
   録音中のバー
========================================= */

const bars = Array.from(
  { length: 30 },
  () => {
    const element =
      document.createElement('i');

    element.className = 'bar';

    $('bars').appendChild(element);

    return element;
  }
);

/* =========================================
   音検出結果の見た目
========================================= */

function injectSoundStyles() {

  if ($('mdpentagon-sound-styles')) {
    return;
  }

  const style =
    document.createElement('style');

  style.id =
    'mdpentagon-sound-styles';

  style.textContent = `
    .sound-detection-card {
      margin-top: 18px;
      padding: 24px;
      border-radius: 28px;
      background: #ffffff;
      box-shadow:
        0 12px 30px rgba(70,55,130,.07);
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
      grid-template-columns:
        46px 1fr auto;
      gap: 12px;
      align-items: center;
      padding: 14px;
      border: 1px solid #ece8f7;
      border-radius: 18px;
      background: #ffffff;
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
      background:
        linear-gradient(
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

    .sound-empty,
    .sound-loading {
      padding: 18px;
      border-radius: 18px;
      background: #faf9fd;
      color: #77718a;
      line-height: 1.7;
    }

    @media (max-width: 600px) {

      .sound-detection-card {
        padding: 20px;
      }

      .sound-item {
        grid-template-columns:
          42px 1fr auto;
      }
    }
  `;

  document.head.appendChild(style);
}

function ensureSoundSection() {

  injectSoundStyles();

  let card =
    $('soundDetectionCard');

  if (card) {
    return card;
  }

  card =
    document.createElement('section');

  card.id =
    'soundDetectionCard';

  card.className =
    'sound-detection-card';

  const chart =
    document.querySelector(
      '#result .chart-card'
    );

  if (
    chart &&
    chart.parentNode
  ) {

    chart.parentNode.insertBefore(
      card,
      chart.nextSibling
    );

  } else {

    $('result').appendChild(card);
  }

  return card;
}

/* =========================================
   MediaPipe / YAMNet
========================================= */

let soundClassifier = null;
let soundModelPromise = null;

const MEDIAPIPE_VERSION =
  '0.10.20';

const MEDIAPIPE_BUNDLE =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@${MEDIAPIPE_VERSION}/audio_bundle.js`;

const MEDIAPIPE_WASM =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@${MEDIAPIPE_VERSION}/wasm`;

const YAMNET_MODEL =
  'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite';

function wait(ms) {

  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        ms
      );
    }
  );
}

function loadMediaPipeScript() {

  return new Promise(
    (resolve, reject) => {

      const oldScript =
        document.querySelector(
          `script[src="${MEDIAPIPE_BUNDLE}"]`
        );

      if (oldScript) {

        if (
          window.AudioClassifier &&
          window.FilesetResolver
        ) {

          resolve();
          return;
        }

        oldScript.addEventListener(
          'load',
          resolve,
          { once: true }
        );

        oldScript.addEventListener(
          'error',
          reject,
          { once: true }
        );

        return;
      }

      const script =
        document.createElement(
          'script'
        );

      script.src =
        MEDIAPIPE_BUNDLE;

      script.crossOrigin =
        'anonymous';

      script.onload =
        resolve;

      script.onerror =
        () =>
          reject(
            new Error(
              'MediaPipeの読み込みに失敗しました'
            )
          );

      document.head.appendChild(
        script
      );
    }
  );
}

async function loadSoundClassifier() {

  if (soundClassifier) {
    return soundClassifier;
  }

  if (soundModelPromise) {
    return soundModelPromise;
  }

  soundModelPromise =
    (async () => {

      try {

        await loadMediaPipeScript();

        if (
          !window.AudioClassifier ||
          !window.FilesetResolver
        ) {

          throw new Error(
            'Audio Classifierが利用できません'
          );
        }

        const audio =
          await window.FilesetResolver
            .forAudioTasks(
              MEDIAPIPE_WASM
            );

        soundClassifier =
          await window.AudioClassifier
            .createFromOptions(
              audio,
              {
                baseOptions: {
                  modelAssetPath:
                    YAMNET_MODEL
                },

                runningMode:
                  'AUDIO_CLIPS',

                maxResults:
                  40,

                scoreThreshold:
                  0.03
              }
            );

        return soundClassifier;

      } catch (error) {

        console.warn(
          '音イベントAIを準備できませんでした',
          error
        );

        soundClassifier =
          null;

        soundModelPromise =
          null;

        return null;
      }

    })();

  return soundModelPromise;
}

/* =========================================
   音の種類AI
   重要：
   ここは結果表示を止めない
========================================= */

async function detectSounds(
  decoded
) {

  if (!decoded) {
    return [];
  }

  const classifier =
    await loadSoundClassifier();

  if (!classifier) {
    return [];
  }

  try {

    const waveform =
      decoded.getChannelData(0);

    const maxSamples =
      Math.min(
        waveform.length,
        decoded.sampleRate * 20
      );

    const audio =
      waveform.slice(
        0,
        maxSamples
      );

    /*
      MediaPipeのclassifyは同期処理。
      ここでは結果画面が出た「後」に
      呼び出す。
    */
    const results =
      classifier.classify(
        audio,
        decoded.sampleRate
      );

    const raw = [];

    for (
      const result of results || []
    ) {

      const categories =
        result
          ?.classifications
          ?.flatMap(
            (classification) =>
              classification.categories ||
              []
          ) || [];

      for (
        const category of categories
      ) {

        const label =
          category.displayName ||
          category.categoryName ||
          '';

        const score =
          Number(
            category.score
          ) || 0;

        if (!label) {
          continue;
        }

        raw.push({
          label,
          score
        });
      }
    }

    const detected = [];

    for (
      const group of soundGroups
    ) {

      const matched =
        raw
          .filter(
            (item) => {

              const lower =
                item.label.toLowerCase();

              return group.patterns.some(
                (pattern) =>
                  lower.includes(
                    pattern.toLowerCase()
                  )
              );
            }
          )
          .sort(
            (a, b) =>
              b.score - a.score
          );

      if (!matched.length) {
        continue;
      }

      const best =
        matched[0];

      /*
        20%以上を「検出」とする。
        あまりにも低い反応は表示しない。
      */
      const score =
        Math.round(
          Math.max(
            0,
            Math.min(
              100,
              best.score * 100
            )
          )
        );

      if (score < 20) {
        continue;
      }

      detected.push({
        name:
          group.name,

        icon:
          group.icon,

        score,

        source:
          best.label
      });
    }

    return detected
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .slice(
        0,
        10
      );

  } catch (error) {

    console.warn(
      '音イベント分析エラー',
      error
    );

    return [];
  }
}

/* =========================================
   録音品質
========================================= */

function calculateRecordingQuality(
  decoded
) {

  if (!decoded) {

    return {
      label:
        '確認できません',

      message:
        '録音データを読み込めませんでした。'
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

    const value =
      data[i];

    sum +=
      value * value;

    count++;

    if (
      Math.abs(value) >
      0.98
    ) {

      clipped++;
    }
  }

  const rms =
    Math.sqrt(
      sum /
      Math.max(
        1,
        count
      )
    );

  const clipRatio =
    clipped /
    Math.max(
      1,
      count
    );

  if (
    decoded.duration < 8
  ) {

    return {
      label:
        '短め',

      message:
        '録音時間が短いため、判定が不安定になる可能性があります。',

      duration:
        Number(
          decoded.duration.toFixed(1)
        )
    };
  }

  if (
    clipRatio > 0.08
  ) {

    return {
      label:
        '音割れに注意',

      message:
        '音が大きすぎて一部が音割れしている可能性があります。',

      duration:
        Number(
          decoded.duration.toFixed(1)
        )
    };
  }

  if (
    rms < 0.002
  ) {

    return {
      label:
        '音が小さめ',

      message:
        '録音された音が小さいため、少し音量を上げて録音すると分析しやすくなります。',

      duration:
        Number(
          decoded.duration.toFixed(1)
        )
    };
  }

  return {
    label:
      '良好',

    message:
      '録音された音量と長さは分析に十分です。',

    duration:
      Number(
        decoded.duration.toFixed(1)
      )
  };
}

/* =========================================
   音検出UI
========================================= */

function showSoundLoading(
  quality
) {

  const card =
    ensureSoundSection();

  const qualityHtml =
    quality
      ? `
        <div class="sound-quality">
          <strong>
            録音品質：
            ${quality.label}
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

  card.innerHTML = `
    <h3>
      この録音で検出された音
    </h3>

    <p class="sound-detection-sub">
      録音された音をAIが分析しています。
      五角形の分析結果はすでに表示されています。
    </p>

    ${qualityHtml}

    <div class="sound-loading">
      音の種類を確認しています…
    </div>
  `;
}

function renderSoundDetections(
  sounds,
  quality
) {

  const card =
    ensureSoundSection();

  const qualityHtml =
    quality
      ? `
        <div class="sound-quality">
          <strong>
            録音品質：
            ${quality.label}
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

  if (
    !sounds.length
  ) {

    card.innerHTML = `
      <h3>
        この録音で検出された音
      </h3>

      <p class="sound-detection-sub">
        録音された音をAIが分析し、
        検出できた音だけを表示します。
      </p>

      ${qualityHtml}

      <div class="sound-empty">
        今回は音の種類を十分に検出できませんでした。
        五角形の分析結果は通常どおり利用できます。
      </div>
    `;

    return;
  }

  const list =
    sounds
      .map(
        (sound) => `
          <div class="sound-item">

            <div class="sound-item-icon">
              ${sound.icon}
            </div>

            <div class="sound-item-main">

              <div class="sound-item-title">
                ${sound.name}
              </div>

              <div class="sound-item-source">
                AIが検出した音：
                ${sound.source}
              </div>

              <div class="sound-item-bar">
                <div
                  class="sound-item-fill"
                  style="
                    width:${sound.score}%
                  "
                ></div>
              </div>

            </div>

            <div class="sound-item-score">
              ${sound.score}%
            </div>

          </div>
        `
      )
      .join('');

  card.innerHTML = `
    <h3>
      この録音で検出された音
    </h3>

    <p class="sound-detection-sub">
      録音された音の中から、
      AIが検出したものを表示しています。
    </p>

    ${qualityHtml}

    <div class="sound-list">
      ${list}
    </div>
  `;
}

/* =========================================
   ボタン
========================================= */

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

/* =========================================
   録音開始
========================================= */

async function startRecording() {

  try {

    stream =
      await navigator.mediaDevices
        .getUserMedia({
          audio: {
            echoCancellation:
              false,

            noiseSuppression:
              false,

            autoGainControl:
              false
          }
        });

    audioCtx =
      new (
        window.AudioContext ||
        window.webkitAudioContext
      )();

    await audioCtx.resume();

    source =
      audioCtx
        .createMediaStreamSource(
          stream
        );

    analyser =
      audioCtx.createAnalyser();

    analyser.fftSize =
      2048;

    analyser.smoothingTimeConstant =
      0.25;

    source.connect(
      analyser
    );

    recorder =
      new MediaRecorder(
        stream
      );

    chunks = [];
    samples = [];
    spectra = [];

    recorder.ondataavailable =
      (event) => {

        if (
          event.data.size
        ) {

          chunks.push(
            event.data
          );
        }
      };

    recorder.onstop =
      analyze;

    recorder.start(250);

    startedAt =
      performance.now();

    $('seconds').textContent =
      '0';

    $('stopBtn').disabled =
      true;

    $('recordHint').textContent =
      '8秒以上録音すると分析できます';

    show(
      'recording'
    );

    /*
      録音中にAIを準備しておく。
      ただし、ここで待たない。
    */
    loadSoundClassifier()
      .catch(() => {});

    timerId =
      setInterval(
        updateTimer,
        200
      );

    visualize();

  } catch (error) {

    console.warn(
      error
    );

    alert(
      'マイクを使用できませんでした。ブラウザの設定でマイクを許可してください。'
    );

    cleanup();

    show(
      'intro'
    );
  }
}

/* =========================================
   タイマー
========================================= */

function updateTimer() {

  const seconds =
    (
      performance.now() -
      startedAt
    ) / 1000;

  $('seconds').textContent =
    Math.floor(
      seconds
    );

  $('stopBtn').disabled =
    seconds < 8;

  $('recordHint').textContent =
    seconds < 8
      ? `あと${Math.ceil(
          8 - seconds
        )}秒で分析できます`
      : '好きなタイミングで分析できます';

  if (
    seconds >= 20
  ) {

    stopRecording();
  }
}

/* =========================================
   録音中の可視化
========================================= */

function visualize() {

  if (!analyser) {
    return;
  }

  const time =
    new Uint8Array(
      analyser.fftSize
    );

  const frequency =
    new Uint8Array(
      analyser.frequencyBinCount
    );

  analyser.getByteTimeDomainData(
    time
  );

  analyser.getByteFrequencyData(
    frequency
  );

  let sum = 0;

  for (
    const value of time
  ) {

    const normalized =
      (
        value - 128
      ) / 128;

    sum +=
      normalized *
      normalized;
  }

  const rms =
    Math.sqrt(
      sum /
      time.length
    );

  samples.push({
    time:
      performance.now() -
      startedAt,

    rms
  });

  let weighted = 0;
  let total = 0;
  let active = 0;

  for (
    let i = 1;
    i < frequency.length;
    i++
  ) {

    const power =
      frequency[i] /
      255;

    weighted +=
      i * power;

    total +=
      power;

    if (
      power > 0.12
    ) {

      active++;
    }
  }

  spectra.push({
    centroid:
      total
        ? weighted /
          total /
          frequency.length
        : 0,

    spread:
      active /
      frequency.length
  });

  bars.forEach(
    (bar, index) => {

      const position =
        Math.floor(
          index *
          frequency.length /
          bars.length
        );

      bar.style.height =
        `${Math.max(
          7,
          Math.min(
            88,
            7 +
              frequency[position] *
                0.32
          )
        )}px`;
    }
  );

  animationId =
    requestAnimationFrame(
      visualize
    );
}

/* =========================================
   録音停止
========================================= */

function stopRecording() {

  if (
    !recorder ||
    recorder.state ===
      'inactive'
  ) {

    return;
  }

  clearInterval(
    timerId
  );

  cancelAnimationFrame(
    animationId
  );

  recorder.stop();

  show(
    'analyzing'
  );
}

/* =========================================
   分析開始
========================================= */

async function analyze() {

  const mimeType =
    recorder?.mimeType ||
    'audio/webm';

  const blob =
    new Blob(
      chunks,
      {
        type:
          mimeType
      }
    );

  let decoded = null;

  try {

    decoded =
      await audioCtx.decodeAudioData(
        await blob.arrayBuffer()
      );

  } catch (error) {

    console.warn(
      '音声のデコードに失敗しました',
      error
    );

    decoded =
      null;
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
    ★ここではAIの結果を待たない。
    五角形結果を即表示する。
  */
  renderResults({
    ...metrics,
    quality
  });

  /*
    ★音の種類AIは後から処理する。
    AIが止まっても結果画面は止まらない。
  */
  showSoundLoading(
    quality
  );

  /*
    モデルがすでに準備できている、
    または短時間で準備できた場合だけ実行。
  */
  setTimeout(
    async () => {

      try {

        const classifier =
          await Promise.race([
            loadSoundClassifier(),
            wait(5000)
          ]);

        if (
          !classifier
        ) {

          renderSoundDetections(
            [],
            quality
          );

          return;
        }

        /*
          classify() 自体は同期処理なので、
          結果画面を描画した後に実行する。
        */
        const sounds =
          await detectSounds(
            decoded
          );

        renderSoundDetections(
          sounds,
          quality
        );

      } catch (error) {

        console.warn(
          '音の種類分析に失敗しました',
          error
        );

        renderSoundDetections(
          [],
          quality
        );
      }
    },
    100
  );
}

/* =========================================
   基本計算
========================================= */

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

function mean(
  array
) {

  return array.length
    ? array.reduce(
        (
          total,
          value
        ) =>
          total + value,
        0
      ) /
      array.length
    : 0;
}

function standardDeviation(
  array
) {

  const average =
    mean(array);

  return Math.sqrt(
    mean(
      array.map(
        (value) =>
          (
            value -
            average
          ) ** 2
      )
    )
  );
}

/* =========================================
   5項目の分析
========================================= */

function calculateMetrics(
  decoded
) {

  let envelope =
    samples.map(
      (sample) =>
        sample.rms
    );

  if (
    decoded
  ) {

    const data =
      decoded.getChannelData(
        0
      );

    const sampleRate =
      decoded.sampleRate;

    const frameSize =
      Math.max(
        1,
        Math.floor(
          sampleRate *
          0.05
        )
      );

    envelope = [];

    for (
      let i = 0;
      i + frameSize <
        data.length;
      i += frameSize
    ) {

      let power = 0;
      let count = 0;

      for (
        let j = 0;
        j < frameSize;
        j += 4
      ) {

        const value =
          data[i + j];

        power +=
          value *
          value;

        count++;
      }

      envelope.push(
        Math.sqrt(
          power /
          Math.max(
            1,
            count
          )
        )
      );
    }
  }

  if (
    envelope.length === 0
  ) {

    envelope = [0];
  }

  const average =
    mean(
      envelope
    );

  const variability =
    average
      ? standardDeviation(
          envelope
        ) /
        average
      : 0;

  const sorted =
    [...envelope].sort(
      (a, b) =>
        a - b
    );

  const p10 =
    sorted[
      Math.floor(
        sorted.length *
        0.1
      )
    ] || 0;

  const p90 =
    sorted[
      Math.floor(
        sorted.length *
        0.9
      )
    ] || 0;

  /*
    音の強さ
  */
  const power =
    clamp(
      (
        20 *
        Math.log10(
          average +
            0.000001
        ) +
        55
      ) *
      2.2
    );

  /*
    変化の大きさ
  */
  const change =
    clamp(
      (
        (p90 - p10) /
        (
          average +
          0.0001
        )
      ) *
      42
    );

  /*
    複雑さ
  */
  const averageSpread =
    mean(
      spectra.map(
        (item) =>
          item.spread
      )
    );

  const averageCentroid =
    mean(
      spectra.map(
        (item) =>
          item.centroid
      )
    );

  const complexity =
    clamp(
      (
        averageSpread -
        0.03
      ) *
      260
      +
      averageCentroid *
      38
    );

  /*
    テンポ
  */
  const tempoData =
    estimateTempo(
      envelope,
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

  /*
    リズムの規則性
  */
  const regularity =
    clamp(
      tempoData.confidence *
        115
      -
      variability *
        12
      +
      16
    );

  return {

    values: [
      tempo,
      regularity,
      power,
      change,
      complexity
    ].map(
      Math.round
    ),

    bpm:
      Math.round(
        tempoData.bpm
      )
  };
}

/* =========================================
   テンポ推定
========================================= */

function estimateTempo(
  envelope,
  framesPerSecond
) {

  if (
    envelope.length < 80
  ) {

    return {
      bpm: 90,
      confidence: 0.35
    };
  }

  const smooth =
    envelope.map(
      (_, index) =>
        mean(
          envelope.slice(
            Math.max(
              0,
              index - 1
            ),
            index + 2
          )
        )
    );

  const onset =
    smooth.map(
      (
        value,
        index
      ) =>
        Math.max(
          0,
          value -
            (
              smooth[
                index - 1
              ] ||
              value
            )
        )
    );

  const minLag =
    Math.floor(
      framesPerSecond *
      60 /
      180
    );

  const maxLag =
    Math.ceil(
      framesPerSecond *
      60 /
      55
    );

  let bestLag =
    Math.round(
      framesPerSecond *
      60 /
      100
    );

  let best =
    -1;

  let total =
    0;

  for (
    let lag = minLag;
    lag <= maxLag;
    lag++
  ) {

    let correlation =
      0;

    for (
      let index = lag;
      index <
        onset.length;
      index++
    ) {

      correlation +=
        onset[index] *
        onset[
          index - lag
        ];
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

  const confidence =
    total > 0
      ? (
          best /
          (
            total /
              (
                maxLag -
                minLag +
                1
              ) +
            0.000000001
          )
        ) /
        5
      : 0.3;

  return {

    bpm:
      clamp(
        60 *
        framesPerSecond /
        bestLag,
        55,
        180
      ),

    confidence
  };
}

/* =========================================
   結果表示
========================================= */

function renderResults(
  data
) {

  cleanup();

  drawRadar(
    data.values
  );

  $('metricList').innerHTML =
    data.values
      .map(
        (
          value,
          index
        ) => `
          <div class="metric">

            <div class="metric-top">

              <span>
                ${
                  metricInfo[
                    index
                  ][0]
                }
              </span>

              <strong>
                ${value}
              </strong>

            </div>

            <div class="track">

              <div
                class="fill"
                style="
                  width:${value}%
                "
              ></div>

            </div>

            <small>

              ${
                index === 0
                  ? `推定テンポ：約${data.bpm} BPM`
                  : metricInfo[
                      index
                    ][1]
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
                style="
                  width:${match.score}%
                "
              ></div>

            </div>

            <strong>
              ${match.score}
            </strong>

          </div>
        `
      )
      .join('');

  show(
    'result'
  );

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

/* =========================================
   活用候補
========================================= */

function scoreMatches(
  values
) {

  const [
    tempo,
    regularity,
    power,
    change,
    complexity
  ] = values;

  const proximity =
    (
      value,
      target
    ) =>
      100 -
      Math.abs(
        value -
        target
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
          regularity
        +
        0.20 *
          proximity(
            power,
            38
          )
        +
        0.18 *
          (
            100 -
            change
          )
        +
        0.12 *
          (
            100 -
            complexity
          ),

      reason:
        '一定の流れと控えめな変化は、作業中の背景音候補になります。歌詞が気になる場合は器楽曲も試してみましょう。'
    },

    {
      name: '休息',
      icon: '☾',

      score:
        0.28 *
          (
            100 -
            tempo
          )
        +
        0.12 *
          regularity
        +
        0.25 *
          (
            100 -
            power
          )
        +
        0.22 *
          (
            100 -
            change
          )
        +
        0.13 *
          (
            100 -
            complexity
          ),

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
          regularity
        +
        0.26 *
          power
        +
        0.23 *
          change
        +
        0.12 *
          complexity,

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

/* =========================================
   レーダーチャート
========================================= */

function drawRadar(
  values
) {

  const canvas =
    $('radar');

  const context =
    canvas.getContext(
      '2d'
    );

  const centerX =
    canvas.width /
    2;

  const centerY =
    canvas.height /
    2 +
    10;

  const radius =
    205;

  context.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  const point =
    (
      index,
      distance
    ) => {

      const angle =
        -Math.PI / 2 +
        index *
          Math.PI *
          2 /
          5;

      return [

        centerX +
          Math.cos(
            angle
          ) *
          distance,

        centerY +
          Math.sin(
            angle
          ) *
          distance
      ];
    };

  /*
    外側の五角形グリッド
  */

  for (
    let level = 1;
    level <= 4;
    level++
  ) {

    context.beginPath();

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

      if (
        i === 0
      ) {

        context.moveTo(
          ...p
        );

      } else {

        context.lineTo(
          ...p
        );
      }
    }

    context.closePath();

    context.strokeStyle =
      '#e5e0f7';

    context.lineWidth =
      2;

    context.stroke();
  }

  /*
    中心から各軸へ
  */

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

    context.beginPath();

    context.moveTo(
      centerX,
      centerY
    );

    context.lineTo(
      ...p
    );

    context.strokeStyle =
      '#ebe7f7';

    context.stroke();
  }

  /*
    分析結果の五角形
  */

  const gradient =
    context.createLinearGradient(
      centerX - radius,
      centerY - radius,
      centerX + radius,
      centerY + radius
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

  context.beginPath();

  values.forEach(
    (
      value,
      index
    ) => {

      const p =
        point(
          index,
          radius *
            value /
            100
        );

      if (
        index === 0
      ) {

        context.moveTo(
          ...p
        );

      } else {

        context.lineTo(
          ...p
        );
      }
    }
  );

  context.closePath();

  context.fillStyle =
    gradient;

  context.fill();

  context.strokeStyle =
    '#7257ff';

  context.lineWidth =
    6;

  context.lineJoin =
    'round';

  context.stroke();

  /*
    5つの点
  */

  values.forEach(
    (
      value,
      index
    ) => {

      const p =
        point(
          index,
          radius *
            value /
            100
        );

      context.beginPath();

      context.arc(
        p[0],
        p[1],
        8,
        0,
        Math.PI *
          2
      );

      context.fillStyle =
        '#ffffff';

      context.fill();

      context.strokeStyle =
        '#7257ff';

      context.lineWidth =
        5;

      context.stroke();
    }
  );

  /*
    ラベル
  */

  const labels = [
    'テンポ感',
    '規則性',
    '音の強さ',
    '変化',
    '複雑さ'
  ];

  labels.forEach(
    (
      label,
      index
    ) => {

      const p =
        point(
          index,
          radius + 50
        );

      context.textAlign =
        'center';

      context.textBaseline =
        'middle';

      context.fillStyle =
        '#353148';

      context.font =
        '700 24px -apple-system, sans-serif';

      context.fillText(
        label,
        p[0],
        p[1]
      );

      context.fillStyle =
        '#7257ff';

      context.font =
        '800 22px -apple-system, sans-serif';

      context.fillText(
        values[index],
        p[0],
        p[1] +
          27
      );
    }
  );
}

/* =========================================
   後片付け
========================================= */

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
      .catch(
        () => {}
      );
  }

  stream =
    null;

  recorder =
    null;

  audioCtx =
    null;

  analyser =
    null;

  source =
    null;
}

/* =========================================
   リセット
========================================= */

function reset() {

  cleanup();

  show(
    'intro'
  );

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

/* =========================================
   Service Worker
========================================= */

if (
  'serviceWorker' in
    navigator &&
  location.protocol
    .startsWith('http')
) {

  navigator.serviceWorker
    .register('sw.js')
    .catch(
      () => {}
    );
}