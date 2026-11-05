/* =========================================================
   Google Gemini 엔진 (무료 요금제로 쓸 수 있음)
   - SDK 없이 REST(fetch) 로 바로 부른다: POST v1beta/models/{모델}:generateContent
   - 키는 x-goog-api-key 헤더로 보낸다 (주소창 기록에 남지 않게 ?key= 는 쓰지 않음)
   - 구조화 출력: generationConfig.responseMimeType + responseJsonSchema
   ========================================================= */

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export const GEMINI_MODELS = [
  { id: 'gemini-flash-latest',      label: 'Gemini Flash (최신) — 기본' },
  { id: 'gemini-flash-lite-latest', label: 'Gemini Flash-Lite (최신) — 더 빠름, 무료 한도 넉넉' },
  { id: 'gemini-pro-latest',        label: 'Gemini Pro (최신) — 정확, 무료 한도 적음' },
];

const KINDS = ['speech', 'thought', 'narration', 'sfx', 'sign', 'other'];

// Gemini 는 물체 위치를 [ymin, xmin, ymax, xmax] (0~1000 으로 정규화) 로 답하는 데 익숙해서 그 형식으로 받는다
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['regions'],
  properties: {
    regions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['box_2d', 'kind', 'speaker', 'original', 'translation'],
        properties: {
          box_2d: {
            type: 'array', minItems: 4, maxItems: 4,
            items: { type: 'integer', minimum: 0, maximum: 1000 },
            description: '[ymin, xmin, ymax, xmax], normalized to 0-1000',
          },
          kind: { type: 'string', enum: KINDS },
          speaker: { type: 'string' },
          original: { type: 'string' },
          translation: { type: 'string' },
        },
      },
    },
  },
  propertyOrdering: ['regions'],
};

/**
 * @param {object} p  translator.js 의 translateImage 와 같은 인자 (apiKey 는 Gemini 키)
 * @param {string} system  공통 지시문
 * @param {string} userText  이미지와 함께 보낼 설명
 * @returns {Promise<{regions:Array, usage:{input:number, output:number}}>}  box 는 보낸 이미지의 픽셀 좌표
 */
export async function translateWithGemini(p, system, userText) {
  if (!p.apiKey) throw new Error('설정에서 Gemini API 키를 먼저 넣어 주세요.');
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: p.image.mediaType, data: p.image.data } },
        { text: userText },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: SCHEMA,
      maxOutputTokens: 16000,
    },
  };

  let res;
  try {
    res = await fetch(`${BASE}/models/${encodeURIComponent(p.model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': p.apiKey },
      body: JSON.stringify(body),
      signal: p.signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('취소했어요.');
    throw new Error('인터넷 연결을 확인해 주세요.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(explain(res.status, data));

  const blocked = data.promptFeedback?.blockReason;
  if (blocked) throw new Error(`Gemini 가 이 이미지를 거절했어요 (${blocked}).`);
  const cand = data.candidates?.[0];
  if (!cand) throw new Error('Gemini 가 답을 주지 않았어요. 다시 시도해 주세요.');
  if (cand.finishReason === 'MAX_TOKENS') throw new Error('대사가 너무 많아 답이 잘렸어요. 페이지를 나눠서(영역 추가) 번역해 보세요.');
  if (cand.finishReason && !['STOP', 'FINISH_REASON_UNSPECIFIED'].includes(cand.finishReason)) {
    throw new Error(`Gemini 가 답을 멈췄어요 (${cand.finishReason}). 다른 모델이나 Claude 로 시도해 보세요.`);
  }

  const text = (cand.content?.parts || []).filter(x => typeof x.text === 'string' && !x.thought).map(x => x.text).join('');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('번역 결과를 읽지 못했어요. 다시 시도해 주세요.'); }

  const W = p.image.width, H = p.image.height;
  const regions = (parsed.regions || []).filter(r => Array.isArray(r.box_2d) && r.box_2d.length === 4).map(r => {
    const [ymin, xmin, ymax, xmax] = r.box_2d.map(v => Math.max(0, Math.min(1000, v)) / 1000);
    return { x0: xmin * W, y0: ymin * H, x1: xmax * W, y1: ymax * H,
             kind: r.kind, speaker: r.speaker, original: r.original, translation: r.translation };
  });

  const u = data.usageMetadata || {};
  return {
    regions,
    usage: { input: u.promptTokenCount || 0, output: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) },
    model: data.modelVersion || p.model,
  };
}

/** 이 키로 쓸 수 있는 모델 중 generateContent 를 지원하는 Gemini 모델 목록 */
export async function listGeminiModels(apiKey) {
  if (!apiKey) throw new Error('Gemini API 키를 먼저 넣어 주세요.');
  const out = [];
  let token = '';
  for (let i = 0; i < 5; i++) {
    const url = `${BASE}/models?pageSize=200${token ? '&pageToken=' + encodeURIComponent(token) : ''}`;
    const res = await fetch(url, { headers: { 'x-goog-api-key': apiKey } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(explain(res.status, data));
    for (const m of data.models || []) {
      const id = (m.name || '').replace(/^models\//, '');
      const ok = (m.supportedGenerationMethods || []).includes('generateContent');
      // 이미지 생성·음성·임베딩 전용 모델은 뺀다
      if (ok && id.startsWith('gemini') && !/(tts|image|embedding|audio|live|robotics)/.test(id)) {
        out.push({ id, label: m.displayName ? `${m.displayName} (${id})` : id });
      }
    }
    token = data.nextPageToken;
    if (!token) break;
  }
  return out;
}

/* HTTP 상태와 오류 내용을 알아듣기 쉬운 말로 */
function explain(status, data) {
  const msg = data?.error?.message || '';
  const reason = JSON.stringify(data?.error?.details || '');
  if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(msg + reason)) return 'Gemini API 키가 올바르지 않아요. 설정에서 키를 확인해 주세요.';
  if (status === 400) return '요청이 거부됐어요: ' + (msg || '잘못된 요청');
  if (status === 403) return '이 키로는 Gemini API 를 쓸 수 없어요. Google AI Studio 에서 키와 프로젝트 설정을 확인해 주세요.';
  if (status === 404) return '설정에서 고른 Gemini 모델을 찾을 수 없어요. "목록 불러오기" 로 쓸 수 있는 모델을 골라 주세요.';
  if (status === 429) return '무료 사용 한도를 다 썼어요. 1분쯤 기다리거나(분당 한도), 내일 다시 시도해 주세요(하루 한도). 급하면 Claude 엔진으로 바꿔 보세요.';
  if (status >= 500) return 'Google 서버에 일시적인 문제가 있어요. 잠시 뒤에 다시 시도해 주세요.';
  return `오류 (${status}): ${msg || '알 수 없는 오류'}`;
}
