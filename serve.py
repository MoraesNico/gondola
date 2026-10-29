#!/usr/bin/env python3
"""Servidor local da Gôndola 3D de Whisky.

Módulos ES e o carregamento de texturas/JSON não funcionam via file://, então a página
precisa ser servida por HTTP. Este servidor usa apenas a biblioteca padrão do Python.

Uso:
    python serve.py                     # http://127.0.0.1:8000 e abre o navegador
    python serve.py --port 9000
    python serve.py --host 0.0.0.0      # acessível por outros dispositivos da rede (ex.: tablet)
    python serve.py --no-browser
"""
from __future__ import annotations

import argparse
import functools
import http.server
import socket
import sys
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Tipos explícitos: alguns sistemas (principalmente Windows) mapeiam .js para text/plain
# no registro, o que faz o navegador recusar módulos ES.
MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".hdr": "application/octet-stream",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
    ".ktx2": "image/ktx2",
    ".woff2": "font/woff2",
    ".md": "text/markdown; charset=utf-8",
}


def cache_policy(url_path: str) -> str:
    """Catálogo, código e página nunca vêm do cache: editar data/whiskies.json e recarregar
    mostra o novo arranjo na hora. Texturas, fontes e bibliotecas (pesadas e estáveis) usam
    revalidação: o navegador guarda e pergunta se mudou (resposta 304, sem baixar de novo)."""
    path = url_path.split("?", 1)[0]
    if path.startswith(("/assets/", "/vendor/")):
        return "no-cache"
    return "no-store"


class GondolaHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **MIME_TYPES}

    def end_headers(self) -> None:
        self.send_header("Cache-Control", cache_policy(self.path))
        super().end_headers()

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - assinatura da stdlib
        if not getattr(self.server, "quiet", False):
            super().log_message(format, *args)


def make_server(host: str = "127.0.0.1", port: int = 8000, quiet: bool = False) -> http.server.ThreadingHTTPServer:
    handler = functools.partial(GondolaHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer((host, port), handler)
    server.quiet = quiet
    return server


def lan_address() -> str | None:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Servidor local da Gôndola 3D de Whisky")
    parser.add_argument("--host", default="127.0.0.1", help="endereço de escuta (padrão: 127.0.0.1)")
    parser.add_argument("--port", "-p", type=int, default=8000, help="porta (padrão: 8000)")
    parser.add_argument("--no-browser", action="store_true", help="não abrir o navegador automaticamente")
    parser.add_argument("--quiet", "-q", action="store_true", help="não registrar cada requisição")
    args = parser.parse_args(argv)

    try:
        server = make_server(args.host, args.port, args.quiet)
    except OSError as exc:
        print(f"Não foi possível usar a porta {args.port}: {exc}. Tente: python serve.py --port 8080", file=sys.stderr)
        return 1

    shown_host = "127.0.0.1" if args.host in ("0.0.0.0", "") else args.host
    url = f"http://{shown_host}:{server.server_port}/"
    print(f"Gôndola 3D servindo {ROOT}")
    print(f"  Local:  {url}")
    if args.host in ("0.0.0.0", ""):
        ip = lan_address()
        if ip:
            print(f"  Rede:   http://{ip}:{server.server_port}/")
    print("Ctrl+C para encerrar.")

    if not args.no_browser:
        threading.Timer(0.6, webbrowser.open, args=(url,)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrado.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
