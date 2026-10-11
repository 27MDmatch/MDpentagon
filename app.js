
/* MDpentagon 音量判定の緊急修正版 */

analyzeAudio = function (buffer) {
  const f = extract(buffer);
  const samples = buffer.getChannelData(0);
  const step = Math.max(
    1,
    Math.floor(samples.length / 20000)
  );

  let power = 0;
  let peak = 0;
  let count = 0;

  for (let i = 0; i < samples.length; i += step) {
    const x = samples[i];
    power += x * x;
    peak = Math.max(peak, Math.abs(x));
    count++;
  }

  const rms = Math.sqrt(power / Math.max(1, count));
  const silent = rms < 0.00008 && peak < 0.0005;

  const t = silent
    ? {
        bpm: null,
        reason: 'ほぼ無音のため',
        candidates: [],
        confidence: '低'
      }
    : estimateTempo(f);

  const level = mean(f.rms);
  const q10 = quantile(f.rms, 0.1);
  const q90 = quantile(f.rms, 0.9);

  const volume = clamp(
    (20 * Math.log10(rms + 1e-8) + 62) * 1.9
  );

  const change = clamp(
    30 * Math.log2(
      1 + (q90 - q10) / (level + 0.001)
    )
  );

  const complexity = clamp(
    (mean(f.entropy) - 0.35) * 150
  );

  return {
    values: [
      t.bpm === null
        ? null
        : clamp((t.bpm - 55) / 1.5),

      t.bpm === null
        ? null
        : (t.confidence === '比較的高い' ? 76 : 55),

      silent ? null : volume,
      silent ? null : change,
      silent ? null : complexity
    ],

    tempo: t,

    quality: {
      duration: buffer.duration.toFixed(1),
      label: silent
        ? 'ほぼ無音'
        : peak > 0.98
          ? '音割れの可能性'
          : '録音できました'
    }
  };
};
