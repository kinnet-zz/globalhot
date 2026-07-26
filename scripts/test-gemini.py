#!/usr/bin/env python3
"""Test Gemini API with various endpoint/model combinations."""
import os, json, sys
from urllib.request import Request, urlopen

key = os.environ.get("GEMINI_API_KEY2") or os.environ.get("GEMINI_API_KEY")
if not key:
    print("No GEMINI_API_KEY found")
    sys.exit(1)

configs = [
    ("v1beta", "gemini-2.0-flash"),
    ("v1beta", "gemini-2.0-flash-001"),
    ("v1beta", "gemini-1.5-flash-002"),
    ("v1", "models/gemini-2.0-flash"),
    ("v1", "models/gemini-1.5-flash"),
    ("v1beta", "models/gemini-2.0-flash"),
    ("v1beta", "models/gemini-1.5-flash"),
]

body = json.dumps({
    "contents": [{"parts": [{"text": "Say hello in Korean"}]}],
    "generationConfig": {"maxOutputTokens": 50},
}).encode()

for ver, model in configs:
    url = f"https://generativelanguage.googleapis.com/{ver}/{model}:generateContent?key={key}"
    print(f"\nTrying: {ver}/{model}")
    try:
        req = Request(url, data=body, headers={"Content-Type": "application/json"})
        resp = json.loads(urlopen(req, timeout=30).read())
        text = resp.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "?")
        print(f"OK: {text[:80]}")
    except Exception as e:
        code = getattr(e, "code", "?")
        print(f"  {code}: {str(e)[:100]}")
