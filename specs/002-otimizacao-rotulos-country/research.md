# Research: Otimização, rótulos fiéis e country executivo

Fonte principal: [docs/referencias/otimizacao-threejs.md](../../docs/referencias/otimizacao-threejs.md)
(100 dicas, three.js r186). Linha de base medida na versão 1 com `tests/perf.mjs` (vista geral,
quadro completo com sombras): **277 draw calls**, **660 k triângulos**, 26 programas, 42 texturas,
**261 MiB** de texturas na GPU e 13 luzes.

## R11. WebGPU ou WebGL?

- **Decision**: manter `WebGLRenderer`.
- **Rationale**: dica 6 ("migre quando bater limites"), 8 ("WebGLRenderer é escolha válida") e 9 ("não é universalmente mais rápido"). O gargalo medido era de draw calls, resolvido com batching (dicas 31–34). Migrar exigiria reescrever RectAreaLight/transmissão em nós e não pode ser validado no ambiente de testes (sem GPU).
- **Alternatives**: `WebGPURenderer` com fallback — fica como evolução futura.

## R12. Draw calls (dicas 30–35)

- **Decision**: `BatchedMesh` opaco com uma geometria por produto (líquido + cápsula + rótulos + etiqueta de preço) e `BatchedMesh` de vidro (cor do vidro por instância via `setColorAt`); tampos, ferragens e fitas LED como `InstancedMesh`; atlas único de rótulos.
- **Rationale**: ~150 garrafas × 4 peças viravam ~40 draw calls por passe; agora são 2.

## R13. Texturas (dicas 22, 27, 28)

- **Decision**: KTX2 — ETC1S (qualidade 160) para `diff` (sRGB); UASTC + RDO + Zstandard para `nor_gl` (modo normal map); ETC1S linear (qualidade 200) para `arm`. `KTX2Loader.detectSupport(renderer)`; falha → JPG.
- **Iteração**: com UASTC também no ARM os arquivos chegavam a 4,5 MB (2k); ETC1S linear ficou com 0,5 MB sem diferença visível na cena. Resultado: 11 MB de KTX2 contra 19 MB de JPG.
- **Rationale**: JPG/PNG chegam descomprimidos na GPU (2048² ≈ 21 MiB com mipmaps); KTX2 fica 4–8× menor em memória.
- **Encoder**: `ktx2-encoder` (basis_universal em WASM) via Node, pois o binário KTX-Software não pôde ser baixado no ambiente.

## R14. Luzes e sombras (dicas 53, 55, 58, 60, 61)

- **Decision**: LEDs assados em lightmaps (tampo: gradiente compartilhado; fundo: faixas por módulo redesenhadas a cada rearranjo); luz principal com sombra 2048² e `shadow.autoUpdate = false` por luz; preenchimento **sem** sombra por padrão (um passe a menos); frustum de sombra ajustado à largura da gôndola; `receiveShadow` desligado em quem nunca recebe sombra; 10 RectAreaLight só no modo "LED realista".
- **Rationale**: 10 RectAreaLight eram avaliadas em todo pixel de todo material (piso e parede inclusive).

## R15. Transmissão do vidro

- **Decision**: `renderer.transmissionResolutionScale = 0.5`.
- **Rationale**: o passe de transmissão re-renderiza a cena opaca; o vidro é fino e quase sem desfoque, então meia resolução não aparece.

## R16. Carregamento e robustez (dicas 5, 85, 98, 100)

- **Decision**: `compileAsync` antes de esconder o loader; `modulepreload`/`preload` de módulos, JSON, HDRI e fontes; `webglcontextlost/restored` com aviso e recarga; `Timer` (já adotado).

## R17. Qualidade adaptativa (dicas 68, 80)

- **Decision**: três níveis (`alta`: DPR ≤ 2, sombra 2048, transmissão 0.5; `media`: DPR 1.5, sombra 1024; `baixa`: DPR 1, sombra 1024, transmissão 0.35). A média de quadros durante animação decide subir (< 12 ms) ou descer (> 28 ms); após 3 trocas o nível trava (`flipflops`). `?quality=` força um nível.

## R18. Rótulos fiéis (princípio VI)

- **Decision**: um template de canvas por marca em `labelArt.js`, desenhando com tipografia equivalente (Cinzel, Playfair Display, Rye, Pinyon Script, Cormorant Garamond, Yuji Syuku para 響), paleta medida nas fotos e emblemas vetoriais simplificados. Desenho em "espaço físico": cada região recebe a proporção real (arco × altura) para não distorcer. Metalização automática: pixels dourados no atlas de cor viram metal/brilho no atlas de dados.
- **Alternatives**: usar as fotos como textura — vetado pelo cliente (`exploit.md` da referência) e por direitos de imagem.

## R19. Country sóbrio e executivo (revisão do cliente)

- **Decision**: linho `#f3ede2` e papel `#faf7f1`, tinta carvão `#24201c`, couro conhaque `#7a4a2a`,
  verde-floresta `#2f4a3a`, latão `#a8874a` só em filetes, bordô `#6e2a22` para alertas.
  Cormorant Garamond (títulos, versaletes), Libre Franklin (texto e botões — gótica americana
  de jornal e escritório, dá o sotaque "americano" sem caricatura) e Zilla Slab (números e
  rótulos de dados — slab de impressão discreta). Bordas de 1 px, filete duplo em latão, raio de
  3 px, sombras curtas e suaves, muito espaço. A cor de cada marca aparece só numa faixa lateral.
- **Rationale**: o cliente pediu "country sem ser estereotipado, sóbrio e executivo". O sotaque
  country vem dos materiais (couro, linho, latão) e da tipografia americana clássica, não de
  ícones temáticos.
- **Alternatives considered**: o brutalismo da primeira proposta (descartado pelo cliente);
  fontes "faroeste" como Rye na interface (vetadas por serem caricatas — Rye fica só no rótulo do
  Jack Daniel's, onde reproduz a referência real).

## Resultados medidos (`tests/perf.mjs`, vista geral, quadro completo com sombras)

| Métrica | v1 | v2 | Variação |
|---|---|---|---|
| Draw calls por quadro | 277 | **40** | −86% (SC-101 ✅ ≤ 100) |
| Triângulos por quadro | 660 k | 556 k | −16% (o vidro agora também projeta sombra) |
| Memória de texturas na GPU | 261 MiB | **116 MiB** | −56% (SC-102 ✅) |
| Texturas comprimidas (KTX2) | 0 | 14 | — |
| Luzes ativas | 13 | 3 | −10 RectAreaLight |
| Programas de shader | 26 | 24 | — |
| Download das texturas PBR | 19 MB (JPG) | 11 MB (KTX2) | −42% |

Vista de comparação (`?lineup`): 11 draw calls para as 10 garrafas com sombras e transmissão.
Medido em Chromium headless com SwiftShader (sem GPU), por isso só contagens são comparáveis
— não há medição de fps em hardware real neste ambiente.
