// Cloudflare Workers AI - 다국어 기사 요약 (short / long mode)
const LANG_CONFIG = {
  ko: {
    system: '당신은 글로벌 뉴스를 한국어로 설명해주는 전문가입니다.',
    promptShort: (title, source) =>
      `다음 기사 제목을 보고 핵심을 1-2문장 한국어로 설명하세요. 제목을 직역하지 말고 왜 중요한지, 무슨 내용인지 설명하세요.\n\n기사 제목: "${title}"\n출처: ${source}\n\n한국어 설명 (1-2문장):`,
    promptLong: (title, source) =>
      `다음 기사 제목을 보고 4~5문장의 한국어 해설을 작성하세요. ①이 기사가 무슨 내용인지, ②왜 중요한지, ③어떤 영향이 있는지를 포함해 풍부하게 설명하세요. 제목을 직역하지 마세요.\n\n기사 제목: "${title}"\n출처: ${source}\n\n한국어 해설 (4~5문장):`,
  },
  en: {
    system: 'You are a global news analyst. Explain articles clearly in English.',
    promptShort: (title, source) =>
      `Given this article title, write a 1-2 sentence English summary explaining what it's about and why it matters.\n\nTitle: "${title}"\nSource: ${source}\n\nEnglish summary:`,
    promptLong: (title, source) =>
      `Given this article title, write a 4-5 sentence English analysis covering ①what the article is about, ②why it matters, ③potential implications.\n\nTitle: "${title}"\nSource: ${source}\n\nEnglish analysis:`,
  },
  ja: {
    system: 'あなたはグローバルニュースを日本語で解説する専門家です。',
    promptShort: (title, source) =>
      `次の記事タイトルを見て、1〜2文の日本語で要約してください。\n\nタイトル: "${title}"\nソース: ${source}\n\n日本語の要約:`,
    promptLong: (title, source) =>
      `次の記事タイトルを見て、①内容、②重要性、③影響を含む4〜5文の日本語解説を書いてください。\n\nタイトル: "${title}"\nソース: ${source}\n\n日本語の解説:`,
  },
  zh: {
    system: '您是一位用中文解释全球新闻的专家。',
    promptShort: (title, source) =>
      `请看以下文章标题，用1-2句中文总结其内容和重要性。\n\n标题："${title}"\n来源: ${source}\n\n中文总结:`,
    promptLong: (title, source) =>
      `请看以下文章标题，写一篇包含①内容、②重要性、③影响的4-5句中文分析。\n\n标题："${title}"\n来源: ${source}\n\n中文分析:`,
  },
};

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!env.AI) {
    return new Response(JSON.stringify({ error: 'AI binding not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { title, source, lang = 'ko', mode = 'short' } = body;
  if (!title || typeof title !== 'string' || title.length > 500) {
    return new Response(JSON.stringify({ error: 'Invalid title' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cfg       = LANG_CONFIG[lang] || LANG_CONFIG.ko;
  const isLong    = mode === 'long';
  const promptFn  = isLong ? cfg.promptLong : cfg.promptShort;
  const maxTokens = isLong ? 350 : 150;

  try {
    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: cfg.system },
        { role: 'user',   content: promptFn(title, source || 'news') },
      ],
      max_tokens: maxTokens,
      temperature: 0.5,
    });

    const summary = result?.response?.trim() ?? '';

    return new Response(JSON.stringify({ summary }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'AI request failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
