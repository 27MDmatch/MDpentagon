
/* MDpentagon 音量判定の修正版 */

function mdRawLevel(buffer) {
  const a = buffer.getChannelData(0);
  const b = buffer.numberOfChannels > 1
    ? buffer.getChannelData(1)
    : null;

  const step = Math.max(
    1,
    Math.floor(a.length / 30000)
  );

  let power = 0;
  let peak = 0;
  let count = 0;

  for (let i = 0; i < a.length; i += step) {
    const v = b ? (a[i] + b[i]) / 2 : a[i];

    power += v * v;
    peak = Math.max(peak, Math.abs(v));
    count++;
  }

  return {
    rms: Math.sqrt(power / Math.max(1, count)),
    peak
  };
}

/* 小さく録音された音を解析用に補正 */

const mdOriginalExtract = extract;

extract = function (buffer) {
  const level = mdRawLevel(buffer);

  const gain = level.rms > 0
    ? clamp(0.07 / level.rms, 1, 30)
    : 1;

  const channels = [];

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = new Float32Array(src.length);

    for (let i = 0; i < src.length; i++) {
      dst[i] = Math.max(
        -1,
        Math.min(1, src[i] * gain)
      );
    }

    channels.push(dst);
  }

  return mdOriginalExtract({
    sampleRate: buffer.sampleRate,
    length: buffer.length,
    duration: buffer.duration,
    numberOfChannels: buffer.numberOfChannels,
    getChannelData: c => channels[c]
  });
};

/* 五角形の各項目を独立して分析 */

analyzeAudio = function (buffer) {
  const level = mdRawLevel(buffer);

  const silent =
    level.rms < 0.00012 &&
    level.peak < 0.001;

  const f = extract(buffer);

  const average = mean(f.rms);
  const q10 = quantile(f.rms, 0.1);
  const q90 = quantile(f.rms, 0.9);

  const tempo = silent
    ? {
        bpm: null,
        reason: 'ほぼ無音のため',
        candidates: [],
        confidence: '低'
      }
    : estimateTempo(f);

  const volume = clamp(
    (20 * Math.log10(level.rms + 1e-8) + 62) * 1.9
  );

  const change = clamp(
    30 * Math.log2(
      1 + (q90 - q10) / (average + 0.001)
    )
  );

  const complexity = clamp(
    (mean(f.entropy) - 0.35) * 150
  );

  const speed = tempo.bpm === null
    ? null
    : clamp((tempo.bpm - 55) / 1.5);

  const regular = tempo.bpm === null
    ? null
    : (
        tempo.confidence === '比較的高い'
          ? 76
          : 55
      );

  const quality = {
    duration: buffer.duration.toFixed(1),

    label: silent
      ? 'ほぼ無音'
      : level.peak > 0.98
        ? '音割れの可能性'
        : level.rms < 0.003
          ? '小さめに録音（補正して分析）'
          : '録音できました'
  };

  return {
    values: [
      speed,
      regular,
      silent ? null : volume,
      silent ? null : change,
      silent ? null : complexity
    ],
    tempo,
    quality
  };
};
