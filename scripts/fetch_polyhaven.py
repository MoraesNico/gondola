#!/usr/bin/env python3
"""Baixa as texturas PBR e o HDRI usados na cena a partir da API pública do Poly Haven.

Todos os assets do Poly Haven são CC0. Os arquivos já estão versionados em assets/,
então este script só é necessário para reproduzir/atualizar o download ou mudar a resolução.

Uso:
    python scripts/fetch_polyhaven.py            # 2k (padrão)
    python scripts/fetch_polyhaven.py --res 1k   # mais leve
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

API = "https://api.polyhaven.com"
ROOT = Path(__file__).resolve().parent.parent
TEXTURE_DIR = ROOT / "assets" / "textures"
HDRI_DIR = ROOT / "assets" / "hdri"

# id do Poly Haven -> (uso na cena, resolução). Peças pequenas/distantes usam 1k para
# poupar memória de GPU; "padrão" segue o --res da linha de comando.
TEXTURES = {
    "lacquered_cherry_wood": ("tampo das prateleiras e laterais", "padrão"),
    "black_painted_planks": ("painel de fundo da gôndola (ripado)", "padrão"),
    "marble_01": ("piso da loja", "padrão"),
    "blue_metal_plate": ("colunas, base e cabeçote (normal/roughness com cor grafite)", "1k"),
    "painted_plaster_wall": ("parede ao fundo", "1k"),
}
HDRI = {"brown_photostudio_02": "reflexos e luz ambiente (IBL)"}

# A API recusa o User-Agent padrão do urllib (HTTP 403); identifique o cliente.
HEADERS = {"User-Agent": "gondola-whisky-3d/1.0 (+https://github.com/MoraesNico/gondola)"}

# nome do mapa na API -> nome do arquivo local. "arm" empacota AO (R), Roughness (G) e
# Metalness (B) — exatamente os canais que o three.js lê de aoMap/roughnessMap/metalnessMap,
# então uma única textura substitui três.
MAPS = {"Diffuse": "diff", "nor_gl": "nor_gl", "arm": "arm"}


def get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=120) as resp:
        dest.write_bytes(resp.read())
    print(f"  {dest.relative_to(ROOT)}  ({dest.stat().st_size // 1024} KiB)")


def fetch_texture(asset_id: str, res: str) -> dict:
    files = get_json(f"{API}/files/{asset_id}")
    got = {}
    for api_name, local in MAPS.items():
        entry = files.get(api_name, {}).get(res, {}).get("jpg")
        if not entry:
            continue
        download(entry["url"], TEXTURE_DIR / asset_id / f"{local}.jpg")
        got[local] = f"{local}.jpg"
    return got


def fetch_hdri(asset_id: str, res: str) -> str:
    files = get_json(f"{API}/files/{asset_id}")
    entry = files["hdri"][res]["hdr"]
    name = f"{asset_id}_{res}.hdr"
    download(entry["url"], HDRI_DIR / name)
    return name


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--res", default="2k", choices=["1k", "2k", "4k"], help="resolução das texturas")
    parser.add_argument("--hdri-res", default="1k", choices=["1k", "2k", "4k"], help="resolução do HDRI")
    args = parser.parse_args()

    manifest = {"source": "https://polyhaven.com", "license": "CC0", "textures": {}, "hdri": {}}
    for asset_id, (use, res) in TEXTURES.items():
        res = args.res if res == "padrão" else res
        print(f"[textura] {asset_id} ({res}) — {use}")
        manifest["textures"][asset_id] = {"use": use, "res": res, "maps": fetch_texture(asset_id, res)}
    for asset_id, use in HDRI.items():
        print(f"[hdri] {asset_id} — {use}")
        manifest["hdri"][asset_id] = {"use": use, "file": fetch_hdri(asset_id, args.hdri_res)}

    (ROOT / "assets" / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("manifest: assets/manifest.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
