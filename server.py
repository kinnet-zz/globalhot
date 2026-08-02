import http.server
import json
import os
import urllib.request
import sys
import webbrowser

PORT = 8899
DIR = os.path.dirname(os.path.abspath(__file__))

OR_KEY = os.environ.get('OPENROUTER2', '')
OC_KEY = os.environ.get('OPENCODE_KEY', '')

if not OR_KEY and not OC_KEY:
    print("OPENROUTER2 또는 OPENCODE_KEY 환경변수가 필요합니다")
    sys.exit(1)

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/key':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({
                'openrouter': OR_KEY, 'opencode': OC_KEY
            }).encode('utf-8'))
            return
        
        if self.path == '/':
            self.path = '/editor.html'
        
        file_path = os.path.join(DIR, self.path.lstrip('/'))
        if os.path.isfile(file_path):
            ext = os.path.splitext(file_path)[1]
            mime = {
                '.html': 'text/html; charset=utf-8',
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.svg': 'image/svg+xml',
            }
            self.send_response(200)
            self.send_header('Content-Type', mime.get(ext, 'application/octet-stream'))
            self.end_headers()
            with open(file_path, 'rb') as f:
                self.wfile.write(f.read())
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'Not found')

    def do_POST(self):
        if self.path == '/api/proxy':
            try:
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length) if length > 0 else b'{}'
                api_key = self.headers.get('X-Api-Key', '')
                api_base = self.headers.get('X-Api-Base', '')
                
                if not api_key or not api_base:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(b'{"error":"missing X-Api-Key or X-Api-Base"}')
                    return
                
                url = api_base.rstrip('/') + '/chat/completions'
                req = urllib.request.Request(url, data=body, headers={
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + api_key,
                })
                if 'openrouter' in api_base:
                    req.add_header('HTTP-Referer', 'https://globalhot.net')
                
                resp = urllib.request.urlopen(req, timeout=120)
                resp_body = resp.read()
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(resp_body)
            except urllib.error.HTTPError as e:
                self.send_response(502)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                err = json.dumps({'error': 'proxy HTTP ' + str(e.code) + ': ' + str(e.reason)})
                self.wfile.write(err.encode('utf-8'))
            except Exception as e:
                self.send_response(502)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                err = json.dumps({'error': 'proxy: ' + str(e)})
                self.wfile.write(err.encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'Not found')
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key, X-Api-Base, HTTP-Referer')
        self.end_headers()

print('Server started at http://localhost:' + str(PORT))
print('Keys: OpenRouter=' + ('yes' if OR_KEY else 'no') + ', OpenCode=' + ('yes' if OC_KEY else 'no'))
webbrowser.open('http://localhost:' + str(PORT) + '/editor.html')
http.server.HTTPServer(('', PORT), Handler).serve_forever()
