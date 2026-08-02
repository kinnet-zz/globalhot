param(
  [Parameter(Mandatory=$true)]
  [string]$Topic,
  [string]$Category = "기술",
  [string]$Provider = "openrouter",
  [string]$Model = "openai/gpt-4o-mini"
)

$orKey = $env:OPENROUTER2
$ocKey = $env:OPENCODE_KEY

if ($Provider -eq "openrouter" -and -not $orKey) { Write-Host "OPENROUTER2 환경변수가 없습니다" -ForegroundColor Red; exit 1 }
if ($Provider -eq "opencode" -and -not $ocKey) { Write-Host "OPENCODE_KEY 환경변수가 없습니다" -ForegroundColor Red; exit 1 }

$key = if ($Provider -eq "openrouter") { $orKey } else { $ocKey }
$base = if ($Provider -eq "openrouter") { "https://openrouter.ai/api/v1" } else { "https://opencode.ai/zen/v1" }

$cat = $Category
Write-Host "`n📝 AI 글 생성 중... (모델: $Model)" -ForegroundColor Cyan

$body = @{
  model = $Model
  messages = @(
    @{ role = "system"; content = "You are a professional Korean journalist. Return ONLY valid JSON in Korean. No markdown fences." }
    @{ role = "user"; content = "Write a Korean curation article about '$Topic' in category '$cat'. Return JSON: {`"title`":`"25-45자 제목`",`"subtitle`":`"50-90자 요약`",`"tags`":[`"태그1`",`"태그2`",`"태그3`",`"태그4`"],`"body_html`":`"<h2>...</h2><p>...</p>`"}. Body: 600-900 words in Korean HTML. Include real 2026 trends, companies, Korea angle." }
  )
  temperature = 0.7
  max_tokens = 4000
} | ConvertTo-Json -Depth 10

$headers = @{
  "Authorization" = "Bearer $key"
  "Content-Type" = "application/json"
}
if ($Provider -eq "openrouter") { $headers["HTTP-Referer"] = "https://globalhot.net" }

try {
  $r = Invoke-WebRequest -Uri "$base/chat/completions" -Method POST -Headers $headers -Body $body -UseBasicParsing
  $json = $r.Content | ConvertFrom-Json
  $raw = $json.choices[0].message.content
} catch {
  Write-Host "API 오류: $_" -ForegroundColor Red
  exit 1
}

# JSON 파싱
$s = $raw.Trim()
if ($s -match '```(?:json)?\s*([\s\S]*?)\s*```') { $s = $matches[1] }
try {
  $d = $s | ConvertFrom-Json
} catch {
  Write-Host "JSON 파싱 실패, 원시 응답을 본문으로 사용" -ForegroundColor Yellow
  $d = $null
}

$title = if ($d) { $d.title } else { $Topic }
$subtitle = if ($d) { $d.subtitle } else { "" }
$tags = if ($d -and $d.tags) { $d.tags -join ", " } else { $Topic }
$bodyHtml = if ($d) { $d.body_html } else { $raw }
$catFull = $Category + " · " + $Topic

# slug 생성
$slug = $title -replace '[^a-zA-Z0-9가-힣\s-]',''
$slug = $slug.Trim().ToLower() -replace '\s+','-'
if ($slug.Length -gt 60) { $slug = $slug.Substring(0,60) }
if (-not $slug) { $slug = "article" }

$dateStr = Get-Date -Format "yyyy.MM.dd"
$dateISO = Get-Date -Format "yyyy-MM-dd"

$tagHtml = if ($d -and $d.tags) { ($d.tags | ForEach-Object { "<span class=""post-tag"">$_</span>" }) -join "" } else { "" }
$desc = if ($subtitle) { $subtitle } else { $title }

$html = @"
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="/analytics.js?v=20260718-2"></script>
  <meta name="description" content="$desc" />
  <title>$title | Global Hot Reads</title>
  <link rel="canonical" href="https://globalhot.net/posts/$slug.html" />
  <link rel="stylesheet" href="/style.css?v=20260718-4" />
  <style>
    .post-wrap{max-width:740px;margin:0 auto;padding:48px 20px 80px}
    .post-category{color:var(--accent);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px}
    .post-wrap h1{font-family:'Noto Serif KR',Georgia,serif;font-size:34px;line-height:1.35;letter-spacing:-0.3px;margin-bottom:14px;word-break:keep-all}
    .post-meta{color:var(--text3);font-size:12px;margin-bottom:8px}
    .post-subtitle{color:var(--text2);font-size:16px;line-height:1.7;margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid var(--border)}
    .post-body{font-size:15.5px;line-height:1.95;color:var(--text)}
    .post-body p{margin-bottom:18px}
    .post-body h2{font-size:22px;font-weight:700;margin:40px 0 14px}
    .post-body blockquote{border-left:3px solid var(--accent);padding:12px 18px;margin:20px 0;background:var(--card);border-radius:0 var(--radius-sm) var(--radius-sm) 0;color:var(--text2);font-style:italic}
    .post-body ul,.post-body ol{padding-left:20px;margin-bottom:18px}
    .post-body li{margin-bottom:8px}
    .post-footer{margin-top:48px;padding-top:24px;border-top:1px solid var(--border)}
    .post-tags{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
    .post-tag{background:var(--bg3);color:var(--text2);font-size:11px;padding:4px 10px;border-radius:4px}
    @media(max-width:600px){.post-wrap h1{font-size:26px}.post-body{font-size:15px}}
  </style>
</head>
<body class="post-page">
  <header class="header">
    <div class="header-inner">
      <a class="logo" href="/" aria-label="Global Hot Reads 홈">
        <span class="logo-text"><span>Global</span><strong>Hot Reads</strong></span>
        <span class="logo-badge">BETA</span>
      </a>
      <nav class="primary-nav" aria-label="주요 메뉴">
        <a href="/#latest">최신 글</a>
        <a href="/#curated">이 주의 큐레이션</a>
        <a href="/posts/">전체 글</a>
        <a href="/about.html">소개</a>
      </nav>
    </div>
  </header>

  <main class="post-wrap">
    <p class="post-category">$catFull</p>
    <h1>$title</h1>
    <p class="post-meta">$dateStr · 거리의악사</p>
    <p class="post-subtitle">$subtitle</p>

    <div class="post-body">
      $bodyHtml
    </div>

    <div class="post-footer">
      <div class="post-tags">$tagHtml</div>
      <p class="post-author" style="color:var(--text3);font-size:13px">편집: 거리의악사</p>
    </div>

    <div class="post-nav" style="display:flex;gap:16px;margin-top:32px;flex-wrap:wrap">
      <a href="/posts/" style="color:var(--accent);font-size:13px;font-weight:600">← 전체 글 목록</a>
      <a href="/posts/" style="color:var(--accent);font-size:13px;font-weight:600">전체 글 목록 →</a>
    </div>

    <div style="margin-top:32px;padding:14px 18px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;color:var(--text3);line-height:1.7">이 글은 정보 제공 목적이며 특정 기술이나 서비스에 대한 추천이 아닙니다. 인용된 데이터와 통계는 각 출처의 저작물입니다.</div>
  </main>

  <footer class="site-footer" style="border-top:1px solid var(--border);padding:32px 20px;background:var(--bg2)">
    <div style="max-width:740px;margin:0 auto">
      <p style="color:var(--text3);font-size:12px">&copy; 2026 Global Hot Reads · <a href="/privacy.html" style="color:var(--text3)">개인정보처리방침</a> · <a href="/terms.html" style="color:var(--text3)">이용약관</a></p>
    </div>
  </footer>
</body>
</html>
"@

$outDir = Join-Path $PSScriptRoot "posts"
$outPath = Join-Path $outDir "$slug.html"
[System.IO.File]::WriteAllText($outPath, $html, [System.Text.Encoding]::UTF8)

Write-Host "`n✅ 글 생성 완료!" -ForegroundColor Green
Write-Host "   제목: $title" -ForegroundColor Cyan
Write-Host "   파일: $outPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "커밋하려면:" -ForegroundColor Yellow
Write-Host "   cd $PSScriptRoot" -ForegroundColor Gray
Write-Host "   git add posts/$slug.html" -ForegroundColor Gray
Write-Host "   git commit -m ""manual-publish: $dateISO - $title""" -ForegroundColor Gray
Write-Host "   git push origin master" -ForegroundColor Gray
