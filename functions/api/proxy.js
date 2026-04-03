export async function onRequest(context) {
  const url = new URL(context.request.url);
  const target = url.searchParams.get('url');

  if (!target) return new Response('Missing url param', { status: 400 });

  // 허용 도메인만 프록시
  const allowed = [
    'trends.google.com',
    'www.reddit.com',
    'reddit.com',
    'api.flickr.com',
    'backend.deviantart.com',
  ];
  const targetHost = new URL(target).hostname;
  if (!allowed.some(h => targetHost === h || targetHost.endsWith('.' + h))) {
    return new Response('Forbidden host', { status: 403 });
  }

  // Reddit은 서버사이드 캐시 (Cloudflare Cache API)
  const isReddit = targetHost === 'www.reddit.com' || targetHost === 'reddit.com';
  if (isReddit) {
    const cache = caches.default;
    const cacheKey = new Request(target);
    const cached = await cache.match(cacheKey);
    if (cached) {
      return new Response(cached.body, {
        status: cached.status,
        headers: {
          'Content-Type': cached.headers.get('Content-Type') || 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300',
          'X-Cache': 'HIT',
        },
      });
    }
  }

  const response = await fetch(target, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, application/xml, text/xml, */*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  const body = await response.text();

  const result = new Response(body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'text/plain',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
      'X-Cache': 'MISS',
    },
  });

  // Reddit 성공 응답만 캐시 저장 (5분)
  if (isReddit && response.ok) {
    const cacheKey = new Request(target);
    const toCache = new Response(body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
    context.waitUntil(caches.default.put(cacheKey, toCache));
  }

  return result;
}
