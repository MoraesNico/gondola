#!/usr/bin/env python3
"""Decodifica uma imagem para RGBA 8 bits cru (stdout) — usado por build_ktx2.mjs.
Imprime a largura e a altura no stderr como "LARGURAxALTURA"."""
import sys

from PIL import Image

im = Image.open(sys.argv[1]).convert("RGBA")
sys.stderr.write(f"{im.width}x{im.height}\n")
sys.stdout.buffer.write(im.tobytes())
