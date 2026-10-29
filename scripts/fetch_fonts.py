#!/usr/bin/env python3
"""Baixa as fontes (SIL Open Font License) usadas na interface e nos rótulos e gera
assets/fonts/fonts.css com caminhos locais, para o projeto funcionar offline.

Uso: python scripts/fetch_fonts.py
"""
from __future__ import annotations

import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "fonts"
CSS_API = "https://fonts.googleapis.com/css2"
# Um User-Agent moderno faz a API devolver woff2.
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

# família → (eixos da API, pasta no repositório google/fonts para o OFL.txt, texto p/ subset)
FAMILIES = {
    # interface (country sóbrio): Cormorant Garamond nos títulos, Libre Franklin no texto,
    # Zilla Slab nos números e rótulos de dados
    "Libre Franklin": ("ital,wght@0,300..800;1,300..800", "librefranklin", None),
    "Zilla Slab": ("wght@400;500;600;700", "zillaslab", None),
    # rótulos (textos miúdos) e painel de desempenho
    "Archivo": ("wdth,wght@62..125,400..900", "archivo", None),
    "IBM Plex Mono": ("wght@400;500;700", "ibmplexmono", None),
    # rótulos
    "Cinzel": ("wght@400..900", "cinzel", None),
    "Playfair Display": ("ital,wght@0,400..900;1,400..900", "playfairdisplay", None),
    "Rye": ("", "rye", None),
    "Pinyon Script": ("", "pinyonscript", None),
    "Cormorant Garamond": ("ital,wght@0,500;0,600;0,700;1,500;1,600", "cormorantgaramond", None),
    # só os glifos usados no Hibiki (subset minúsculo)
    "Yuji Syuku": ("", "yujisyuku", "響ウイスキー"),
}


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    css_out = ["/* Gerado por scripts/fetch_fonts.py — fontes SIL OFL 1.1 (ver OFL-*.txt) */"]
    for family, (axes, ofl_dir, text) in FAMILIES.items():
        params = {"family": f"{family}:{axes}" if axes else family, "display": "swap"}
        if text:
            params["text"] = text
        css = get(f"{CSS_API}?{urllib.parse.urlencode(params)}").decode()
        # Mantém só o subset latino (ou o subset por texto, que não tem comentário).
        blocks = re.findall(r"(/\* ([\w-]+) \*/\s*)?(@font-face\s*{[^}]+})", css)
        slug = family.lower().replace(" ", "-")
        n = 0
        for _, subset, block in blocks:
            if subset and subset != "latin":
                continue
            url = re.search(r"url\((https://[^)]+)\)", block).group(1)
            style = re.search(r"font-style:\s*(\w+)", block).group(1)
            weight = re.search(r"font-weight:\s*([\d ]+)", block).group(1).strip().replace(" ", "-")
            name = f"{slug}-{style}-{weight}.woff2"
            (OUT / name).write_bytes(get(url))
            css_out.append(block.replace(url, name))
            n += 1
            print(f"  {name} ({(OUT / name).stat().st_size // 1024} KiB)")
        try:
            (OUT / f"OFL-{slug}.txt").write_bytes(get(f"https://raw.githubusercontent.com/google/fonts/main/ofl/{ofl_dir}/OFL.txt"))
        except Exception as exc:  # noqa: BLE001 — licença é complementar; avisa e segue
            print(f"  aviso: OFL de {family} não baixado ({exc})", file=sys.stderr)
        print(f"[fonte] {family}: {n} arquivo(s)")
    (OUT / "fonts.css").write_text("\n".join(css_out) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
