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

  const response = await fetch(target, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, application/xml, text/xml, */*',
    },
  });

  const body = await response.text();

  return new Response(body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'text/plain',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
