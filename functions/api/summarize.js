// Cloudflare Workers AI - 기사 제목 한국어 요약
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

  const { title, source } = body;
  if (!title || typeof title !== 'string' || title.length > 500) {
    return new Response(JSON.stringify({ error: 'Invalid title' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const prompt = `You are a Korean tech news summarizer. Given an article title, write a 1-2 sentence Korean summary explaining why this topic matters and what it's about. Be concise and insightful. Do NOT translate the title literally - explain the essence.

Article title: "${title}"
Source: ${source || 'tech news'}

Korean summary (1-2 sentences only):`;

  try {
    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: '당신은 글로벌 기술 뉴스를 한국어로 설명해주는 전문가입니다. 짧고 핵심적으로 설명하세요.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 150,
      temperature: 0.4,
    });

    const summary = result?.response?.trim() ?? '';

    return new Response(JSON.stringify({ summary }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400', // 24시간 캐시
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'AI request failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
