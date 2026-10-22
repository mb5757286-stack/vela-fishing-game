#!/usr/bin/env python3
"""Минимальный сервер зон: GET отдаёт zones.json, POST сохраняет его (нужен токен).

Запуск:  ZONES_TOKEN=придумайте_пароль python3 server.py 8080
Дальше отдайте адрес http(s)://ВАШ_ДОМЕН/zones.json (через nginx/Caddy с HTTPS)
и укажите его в zones/src/common/config.js.
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'zones.json')
TOKEN = os.environ.get('ZONES_TOKEN', '')
CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype='application/json'):
        data = body.encode('utf-8') if isinstance(body, str) else body
        self.send_response(code)
        for k, v in CORS.items():
            self.send_header(k, v)
        self.send_header('Content-Type', ctype + '; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self._send(204, b'', 'text/plain')

    def do_GET(self):
        if self.path.split('?')[0] != '/zones.json':
            return self._send(404, '{"error":"not found"}')
        if not os.path.exists(DATA):
            return self._send(200, '[]')
        with open(DATA, 'rb') as f:
            return self._send(200, f.read())

    def do_POST(self):
        if self.path.split('?')[0] != '/zones.json':
            return self._send(404, '{"error":"not found"}')
        if not TOKEN or self.headers.get('X-Token') != TOKEN:
            return self._send(403, '{"error":"bad token"}')
        length = int(self.headers.get('Content-Length', '0'))
        raw = self.rfile.read(length)
        try:
            zones = json.loads(raw.decode('utf-8'))
            if not isinstance(zones, list):
                raise ValueError('ожидается список зон')
        except Exception as err:
            return self._send(400, json.dumps({'error': str(err)}, ensure_ascii=False))
        with open(DATA, 'w', encoding='utf-8') as f:
            json.dump(zones, f, ensure_ascii=False, indent=2)
        return self._send(200, json.dumps({'ok': True, 'count': len(zones)}))


if __name__ == '__main__':
    if not TOKEN:
        print('Задайте ZONES_TOKEN в окружении', file=sys.stderr)
        sys.exit(1)
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print('Сервер зон на порту', port)
    HTTPServer(('0.0.0.0', port), Handler).serve_forever()
