const url = "https://news.google.com/rss/articles/CBMif0FVX3lxTE1hMFBjdU5xUThDNTk2ekhMY2N0dHhiazdRTkJPN0RiWFdwamowckVUV3JiQkNTTkxDU3hRNWljcEphdEhKM1FDSTEtY0ZsR3dray1oYzFCeVI1VHZzWXEyOVY2UHVDMjNzSGtRTVJibHVhZTcwYXRkR3pvMDNHQ2s?oc=5";
const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
const t = await r.text();
for (const pat of [/data-n-au=["']([^"']+)/g, /href="(https?:\/\/(?!news\.google|www\.google|lh3|accounts)[^"]{20,120})"/g, /"(https?:\/\/(?!news\.google|www\.google|lh3|accounts|policies)[a-z0-9.\-]+\.[a-z]{2,}\/[^"]{5,100})"/gi]) {
  const hits = [...t.matchAll(pat)].slice(0, 5).map((m) => m[1].slice(0, 90));
  console.log(JSON.stringify(hits));
}
