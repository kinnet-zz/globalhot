// Cloudflare Workers AI - 다국어 기사 요약 (short / long mode)
const LANG_CONFIG = {
  ko: {
    system: `당신은 테크·국제 분야 15년 경력의 전문 칼럼니스트입니다.
독자에게 직접 말하듯 자연스럽고 생동감 있는 한국어로 씁니다.
절대 금지 표현: "이 기사는", "이번 소식은", "~에 따르면", "~것으로 알려졌다", "첫째/둘째/셋째", "①②③", "해당 기사", "본 기사"
문장은 짧고 명확하게. 전문 지식을 바탕으로 독자가 몰랐을 맥락과 통찰을 제공하세요.`,
    promptShort: (title, source) =>
      `다음 뉴스를 2문장으로 설명하세요. 제목 직역 금지. 왜 주목해야 하는지 칼럼니스트 시각으로.\n\n"${title}" (${source})\n\n해설:`,
    promptLong: (title, source) =>
      `다음 뉴스를 전문 칼럼니스트 시각으로 3~4문장 해설하세요.

규칙:
- 자연스러운 구어체 한국어 (번역투 금지)
- "이 기사는/이번 소식은/~에 따르면" 절대 금지
- 번호 매기기(①②③, 첫째/둘째) 금지
- 독자가 몰랐을 배경이나 맥락을 포함
- 마지막 문장: 앞으로 주목할 포인트나 칼럼니스트의 시각

뉴스: "${title}" (${source})

해설:`,
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
