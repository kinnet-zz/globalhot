export async function onRequest(context) {
  const key = context.env.YOUTUBE_API_KEY || 'AIzaSyA39AKCMnSjCm2Jq83xM04d_48wKaQtp-c';
  if (!key) return new Response('YouTube API key not configured', { status: 500 });

  const { searchParams } = new URL(context.request.url);
  const regionCode = searchParams.get('regionCode') || 'KR';

  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=${regionCode}&maxResults=20&videoCategoryId=0&key=${key}`;
  const r = await fetch(url);
  const body = await r.text();

  return new Response(body, {
    status: r.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
