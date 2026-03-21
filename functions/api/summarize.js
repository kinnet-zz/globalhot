// Cloudflare Workers AI - 다국어 기사 요약
const LANG_CONFIG = {
  ko: {
    system:  '당신은 글로벌 뉴스를 한국어로 설명해주는 전문가입니다. 짧고 핵심적으로 설명하세요.',
    prompt:  (title, source) =>
      `다음 기사 제목을 보고 핵심을 1-2문장 한국어로 설명하세요. 제목을 직역하지 말고 왜 중요한지, 무슨 내용인지 설명하세요.\n\n기사 제목: "${title}"\n출처: ${source}\n\n한국어 설명 (1-2문장):`,
  },
  en: {
    system:  'You are a global news analyst. Summarize articles concisely in English.',
    prompt:  (title, source) =>
      `Given this article title, write a 1-2 sentence English summary explaining what it's about and why it matters. Do NOT just translate - explain the essence.\n\nTitle: "${title}"\nSource: ${source}\n\nEnglish summary (1-2 sentences):`,
  },
  ja: {
    system:  'あなたはグローバルニュースを日本語で解説する専門家です。簡潔に説明してください。',
    prompt:  (title, source) =>
      `次の記事タイトルを見て、1〜2文の日本語で要約してください。タイトルを直訳せず、重要な点を説明してください。\n\nタイトル: "${title}"\nソース: ${source}\n\n日本語の要約（1〜2文）:`,
  },
  zh: {
    system:  '您是一位用中文解释全球新闻的专家。请简洁地说明。',
    prompt:  (title, source) =>
      `请看以下文章标题，用1-2句中文总结其内容和重要性。不要直译标题，请解释核心要点。\n\n标题："${title}"\n来源: ${source}\n\n中文总结（1-2句）:`,
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

  const { title, source, lang = 'ko' } = body;
  if (!title || typeof title !== 'string' || title.length > 500) {
    return new Response(JSON.stringify({ error: 'Invalid title' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cfg = LANG_CONFIG[lang] || LANG_CONFIG.ko;

  try {
    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: cfg.system },
        { role: 'user',   content: cfg.prompt(title, source || 'news') },
      ],
      max_tokens: 150,
      temperature: 0.4,
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
