import crypto from 'node:crypto';

// 真实环境基线：无本地神经模型与外部 API key 时使用确定性字符 n-gram 哈希向量。
// 接口保持与真实 provider 一致：embed(texts) -> number[][]，便于替换为 BGE/OpenAI。
export const MODEL = {
  name: 'local-hash-bigram-v1',
  dim: 256,
  normalization: 'l2',
  note: '确定性哈希向量，不是神经 embedding；用于可重复离线基线',
};

const CJK = /[\u4e00-\u9fff]/;

export function tokenize(text) {
  const lower = text.toLowerCase();
  const words = lower.match(/[a-z0-9]+(?:[._:/%+-][a-z0-9]+)*/g) || [];
  const tokens = [...words];
  for (const ch of lower) {
    if (CJK.test(ch)) tokens.push(ch);
  }
  const cjkRuns = lower.match(/[\u4e00-\u9fff]+/g) || [];
  for (const run of cjkRuns) {
    for (let i = 0; i < run.length - 1; i++) tokens.push(run.slice(i, i + 2));
  }
  return tokens;
}

function bucket(token) {
  const h = crypto.createHash('sha256').update(token).digest();
  const idx = ((h[0] << 8) | h[1]) % MODEL.dim;
  const sign = h[2] & 1 ? 1 : -1;
  return [idx, sign];
}

export function embedOne(text) {
  const vec = new Array(MODEL.dim).fill(0);
  for (const token of tokenize(text)) {
    const [idx, sign] = bucket(token);
    vec[idx] += sign;
  }
  const norm = Math.hypot(...vec) || 1;
  return vec.map((v) => Number((v / norm).toFixed(6)));
}

export function embed(texts) {
  return texts.map(embedOne);
}

export function getProvider() {
  if (process.env.OPENAI_API_KEY) {
    return {
      kind: 'openai',
      name: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
      dim: 1536,
      note: '仅声明适配器；本次运行未调用外部 API',
    };
  }
  return { kind: 'local', ...MODEL };
}
