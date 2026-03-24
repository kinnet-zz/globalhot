// Cloudflare Workers AI - 다국어 기사 요약 (short / long mode)
// KV 캐싱: 동일 기사는 최초 1회만 AI 호출, 이후 모든 방문자는 KV에서 반환
const LANG_CONFIG = {
  ko: {
    system: '당신은 IT·국제 분야 전문 칼럼니스트입니다. 간결하고 통찰 있는 한국어로 씁니다.',
    promptShort: (title, source) =>
      `뉴스: "${title}" (${source})\n\n2문장 칼럼:`,
    promptLong: (title, source) =>
      `뉴스: "${title}" (${source})\n\n3~4문장 칼럼:`,
    fewShot: [
      {
        user: '뉴스: "Google fires 28 employees after protest against Israel contract" (Hacker News)\n\n3~4문장 칼럼:',
        assistant: '구글이 이스라엘 군 계약에 반대해 사내 시위를 벌인 직원 28명을 해고했다. 실리콘밸리가 "사회적 책임"을 내세우면서도 수익성 높은 방위 계약 앞에서는 다른 선택을 한다는 사실이 다시 한번 드러난 셈이다. AI가 군사 기술에 깊숙이 연루될수록 이런 내부 갈등은 앞으로 더 빈번하게 터져 나올 것이다.',
      },
      {
        user: '뉴스: "Japan\'s birth rate hits record low for 8th consecutive year" (BBC World)\n\n3~4문장 칼럼:',
        assistant: '일본의 출생률이 8년 연속 역대 최저를 경신했다. 인구 절벽이 코앞인데 정부의 대응은 여전히 보육 지원금 확대 수준에 머물러 있어, 근본적인 노동 문화나 주거비 문제는 손도 못 대고 있다. 한국 역시 같은 경로를 밟고 있다는 점에서 남의 일로만 볼 수가 없다.',
      },
    ],
  },
  en: {
    system: `You are a senior tech and international affairs columnist with 15 years of experience.
Write in natural, direct prose — like you're explaining to a smart friend, not filing a news report.
Banned phrases: "This article", "According to", "It is reported", "Firstly/Secondly", "In conclusion".
Be concise, insightful, and opinionated where appropriate.`,
    promptShort: (title, source) =>
      `Explain this news in 2 sentences from a columnist's perspective. No direct translation of the title.\n\n"${title}" (${source})\n\nAnalysis:`,
    promptLong: (title, source) =>
      `Write a 3-4 sentence columnist analysis of this news.

Rules:
- Natural conversational tone (not news-speak)
- No "This article/According to/It is reported/Firstly/Secondly"
- Include context the reader might not know
- End with a forward-looking insight or your columnist take

News: "${title}" (${source})

Analysis:`,
  },
  ja: {
    system: `あなたはテクノロジー・国際情勢専門の15年キャリアコラムニストです。
読者に直接話しかけるような自然な日本語で書いてください。
禁止表現:「この記事は」「~によると」「~とのこと」「まず/次に/最後に」`,
    promptShort: (title, source) =>
      `コラムニスト視点で2文で解説してください。タイトルの直訳禁止。\n\n「${title}」(${source})\n\n解説:`,
    promptLong: (title, source) =>
      `コラムニスト視点で3〜4文の解説を書いてください。

ルール:
- 自然な口語体（翻訳調禁止）
- 「この記事は/~によると/まず/次に」絶対禁止
- 読者が知らない背景や文脈を含める
- 最後の文：今後の注目ポイントや独自の見解

ニュース:「${title}」(${source})

解説:`,
  },
  zh: {
    system: `您是一位拥有15年经验的科技与国际事务专栏作家。
用自然流畅的中文写作，像直接和读者交谈一样。
禁止用语："该文章"、"据报道"、"首先/其次/最后"、"综上所述"`,
    promptShort: (title, source) =>
      `用专栏作家视角用2句话解读这条新闻。禁止直译标题。\n\n"${title}"（${source}）\n\n解读:`,
    promptLong: (title, source) =>
      `用专栏作家视角写3-4句解读。

规则：
- 自然口语化中文（非翻译腔）
- 绝对禁止"该文章/据报道/首先/其次"
- 包含读者可能不知道的背景信息
- 最后一句：前瞻性见解或专栏作家观点

新闻："${title}"（${source}）

解读:`,
  },
};

function kvKey(lang, title, mode) {
  return `${lang}:${mode}:${title.slice(0, 100)}`;
}

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

  const cacheKey = kvKey(lang, title, mode);

  // KV 캐시 확인 - 방문자 수에 관계없이 동일 기사는 AI 미호출
  if (env.SUMMARY_KV) {
    const cached = await env.SUMMARY_KV.get(cacheKey);
    if (cached) {
      return new Response(cached, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=86400',
          'X-Cache': 'HIT',
        },
      });
    }
  }

  const cfg       = LANG_CONFIG[lang] || LANG_CONFIG.ko;
  const isLong    = mode === 'long';
  const promptFn  = isLong ? cfg.promptLong : cfg.promptShort;
  const maxTokens = isLong ? 350 : 150;

  const fewShotMessages = (cfg.fewShot || []).flatMap(ex => [
    { role: 'user',      content: ex.user      },
    { role: 'assistant', content: ex.assistant  },
  ]);

  try {
    const result = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: cfg.system },
        ...fewShotMessages,
        { role: 'user',   content: promptFn(title, source || 'news') },
      ],
      max_tokens: maxTokens,
      temperature: 0.6,
    });

    const summary = result?.response?.trim() ?? '';
    const responseBody = JSON.stringify({ summary });

    // KV에 저장 - 24시간 TTL, 이후 모든 방문자는 KV에서 반환
    if (env.SUMMARY_KV && summary) {
      await env.SUMMARY_KV.put(cacheKey, responseBody, { expirationTtl: 86400 });
    }

    return new Response(responseBody, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400',
        'X-Cache': 'MISS',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'AI request failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
