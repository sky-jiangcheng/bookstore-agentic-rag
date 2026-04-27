const DENSE_DIMENSIONS = 1536;
const SPARSE_DIMENSIONS = 1_000_003;
const MAX_DOCUMENT_CHARS = 6000;
const MAX_DESCRIPTION_CHARS = 1200;
const MAX_TOKENS = 512;

const TOKEN_PATTERN = /\p{Script=Han}+|[\p{L}\p{N}]+/gu;

function normalizeText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).replace(/\s+/g, ' ').trim();
}

function limitText(value, maxLength) {
  const text = normalizeText(value);
  if (!text) {
    return '';
  }

  return text.slice(0, maxLength);
}

function hashToken(token, seed = 0) {
  let hash = 2166136261 ^ seed;

  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.codePointAt(i) || 0;
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function expandToken(token) {
  const expanded = [token];

  if (/^\p{Script=Han}+$/u.test(token)) {
    if (token.length > 1) {
      const limit = Math.min(token.length - 1, 12);
      for (let i = 0; i < limit; i += 1) {
        expanded.push(token.slice(i, i + 2));
      }
    }
    return expanded;
  }

  if (token.length >= 5) {
    expanded.push(token.slice(0, 4));
  }

  return expanded;
}

function tokenize(text) {
  const normalized = limitText(text, MAX_DOCUMENT_CHARS).toLowerCase();
  const matches = normalized.match(TOKEN_PATTERN) || [];
  const tokens = [];

  for (const match of matches) {
    for (const token of expandToken(match)) {
      if (token) {
        tokens.push(token);
      }
    }

    if (tokens.length >= MAX_TOKENS) {
      break;
    }
  }

  return tokens.slice(0, MAX_TOKENS);
}

function buildDenseVector(text, dimensions = DENSE_DIMENSIONS) {
  const tokens = tokenize(text);
  const vector = new Array(dimensions).fill(0);

  if (tokens.length === 0) {
    vector[0] = 1;
    return vector;
  }

  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  for (const [token, count] of counts.entries()) {
    const baseWeight = Math.log1p(count);

    for (let projection = 0; projection < 4; projection += 1) {
      const hash = hashToken(`${token}:${projection}`, projection);
      const index = hash % dimensions;
      const sign = hash % 2 === 0 ? 1 : -1;
      vector[index] += sign * (baseWeight / (projection + 1));
    }
  }

  let norm = 0;
  for (const value of vector) {
    norm += value * value;
  }

  if (norm === 0) {
    vector[0] = 1;
    return vector;
  }

  const scale = 1 / Math.sqrt(norm);
  return vector.map((value) => value * scale);
}

function buildSparseVector(text) {
  const tokens = tokenize(text);

  if (tokens.length === 0) {
    return {
      indices: [0],
      values: [1],
    };
  }

  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  const entries = Array.from(counts.entries())
    .map(([token, count]) => ({
      token,
      count,
      score: Math.log1p(count),
      index: hashToken(token) % SPARSE_DIMENSIONS,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 256);

  const aggregated = new Map();
  for (const entry of entries) {
    aggregated.set(entry.index, (aggregated.get(entry.index) || 0) + entry.score);
  }

  const sorted = Array.from(aggregated.entries()).sort((a, b) => a[0] - b[0]);

  return {
    indices: sorted.map(([index]) => index),
    values: sorted.map(([, value]) => value),
  };
}

function buildEmbeddingPair(text) {
  const normalized = normalizeText(text);
  return {
    vector: buildDenseVector(normalized),
    sparseVector: buildSparseVector(normalized),
  };
}

function buildBookDocument(record) {
  if (!record) {
    return '';
  }

  const vectorText = normalizeText(record.vector_text || record.vectorText);
  if (vectorText) {
    return vectorText.slice(0, MAX_DOCUMENT_CHARS);
  }

  const title = normalizeText(record.title);
  const author = normalizeText(record.author) || 'Unknown Author';
  const publisher = normalizeText(record.publisher) || 'Unknown Publisher';
  const category = normalizeText(record.category) || 'general';
  const descriptionSource =
    record.summary_short ??
    record.summaryShort ??
    record.description ??
    record.summary ??
    '';
  const description = limitText(descriptionSource, MAX_DESCRIPTION_CHARS);

  return [
    `Title: ${title}`,
    `Author: ${author}`,
    `Publisher: ${publisher}`,
    `Category: ${category}`,
    `Description: ${description}`,
  ]
    .filter((line) => line && !line.endsWith(': '))
    .join('\n');
}

export {
  DENSE_DIMENSIONS,
  SPARSE_DIMENSIONS,
  buildBookDocument,
  buildDenseVector,
  buildEmbeddingPair,
  buildSparseVector,
  hashToken,
  limitText,
  normalizeText,
  tokenize,
};
