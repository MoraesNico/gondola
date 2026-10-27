# Research: Gôndola 3D de Whisky

Fontes consultadas: [katopz/best-practices → three.js tips](https://github.com/katopz/best-practices/blob/master/threejs-tips-amd-trick.md)
(espelho de *The Big List of three.js Tips and Tricks*, discoverthreejs.com),
[tankvn/awesome-threejs](https://github.com/tankvn/awesome-threejs), [Poly Haven API](https://api.polyhaven.com),
código-fonte do three.js r186.

## R1. Motor de renderização

- **Decision**: three.js 0.186.1 com `WebGLRenderer` (WebGL2).
- **Rationale**: suporte maduro a `MeshPhysicalMaterial` (transmissão para vidro), shadow maps, `RectAreaLight` e IBL via PMREM; roda em todos os navegadores-alvo.
- **Alternatives considered**: `WebGPURenderer`/TSL (suporte ainda irregular em Firefox/Safari); Babylon.js (fora do requisito three.js).

## R2. Gerenciamento de cor e luz (atualizando as dicas antigas)

- **Decision**: `outputColorSpace = SRGBColorSpace`, `toneMapping = ACESFilmicToneMapping`, exposição ajustável; mapas de cor (`diff`) em `SRGBColorSpace`, mapas de dados (`nor_gl`, `arm`) em espaço linear; intensidades em unidades físicas (candela/lux).
- **Rationale**: a lista de dicas recomenda `gammaOutput`/`physicallyCorrectLights`, APIs removidas; o equivalente moderno é o color management padrão (r152+) e luzes físicas por padrão (r155+). A regra "só cor/emissivo em sRGB" continua válida.
- **Alternatives considered**: `AgXToneMapping` (disponível como opção no painel de iluminação).

## R3. Sombras

- **Decision**: `shadowMap.type = PCFShadowMap` com `shadow.radius` (suavização) e opção `VSMShadowMap` no painel; SpotLight principal com mapa 2048², DirectionalLight de preenchimento com 1024²; `bias`/`normalBias` calibrados; `shadowMap.autoUpdate = false` e `needsUpdate = true` só quando algo muda (animação de arranjo, luz movida).
- **Rationale**: no r186, `PCFSoftShadowMap` foi removido (o renderer emite aviso e cai para PCF — verificado em `WebGLShadowMap.js`). A dica "cena estática → atualizar shadow map só quando mudar" reduz custo. Spot/Directional renderizam o mapa 1×, enquanto PointLight renderiza 6× (dica de sombras) — por isso nenhuma PointLight com sombra.
- **Alternatives considered**: sombras assadas (baked) — impossível porque o arranjo muda em tempo real.

## R4. Texturas fotorrealistas (Poly Haven)

- **Decision**: 5 materiais CC0 baixados via API (`/files/{id}`) por `scripts/fetch_polyhaven.py`:

  | Asset | Uso | Res. |
  |---|---|---|
  | `lacquered_cherry_wood` | tampo das prateleiras / laterais | 2k |
  | `black_painted_planks` | painel de fundo ripado | 2k |
  | `marble_01` | piso | 2k |
  | `blue_metal_plate` (normal + ARM, cor grafite) | colunas, base, cabeçote | 1k |
  | `painted_plaster_wall` | parede | 1k |
  | HDRI `brown_photostudio_02` | IBL / reflexos | 1k |

  Mapas: `Diffuse`, `nor_gl` (convenção OpenGL = three.js) e `arm` (AO/Rough/Metal empacotados nos canais R/G/B que o three.js lê). API exige `User-Agent` explícito (403 sem ele).
- **Rationale**: um único `arm` substitui três texturas (≈ –35 % de memória). Todas são POT (dica de texturas). Repetição por mesh via `texture.clone()` — clones compartilham o mesmo `Source`, então a imagem sobe para a GPU uma vez. Anisotropia até 8 para o piso em ângulo rasante.
- **Alternatives considered**: 4k (memória excessiva em GPU integrada); `nor_dx` (exigiria inverter o canal verde).

## R5. Garrafas

- **Decision**: geometria procedural tipo *lathe* generalizado: perfil (raio × altura) + seção transversal parametrizável — círculo, superelipse quadrada (Jack Daniel's, Johnnie Walker, Ballantine's), elipse achatada (frasco Woodford) e polígono de 24 faces (Hibiki). Vidro em `MeshPhysicalMaterial` (`transmission`, `ior 1.5`, `thickness`); líquido em malha interna opaca de alto brilho.
- **Rationale**: não há modelos 3D licenciados das marcas; o gerador cobre as 4 silhuetas com ~150 linhas. O three.js não renderiza objetos transmissivos através de outros transmissivos (o passe de transmissão só captura opacos), então o líquido precisa ser opaco para aparecer dentro do vidro.
- **Alternatives considered**: modelos glTF de terceiros (licença/peso; dica "use glTF + Draco" fica para versões futuras).

## R6. Desempenho com ~100 garrafas

- **Decision**: um `InstancedMesh` por produto × peça (vidro, líquido, tampa, rótulo) → ≈ 40 draw calls para todas as garrafas; geometrias e materiais compartilhados; `matrixAutoUpdate = false` em peças estáticas; pixel ratio limitado a 2.
- **Rationale**: dicas "reutilize objetos", "instancing para muitos objetos iguais", "menos draw calls", "limite o pixel ratio".

## R7. Fitas LED sob as prateleiras

- **Decision**: faixa emissiva + `RectAreaLight` apontando para baixo; 10 luzes pré-alocadas; prateleiras sem produto ficam com intensidade 0.
- **Rationale**: dica "evite adicionar/remover luzes — força recompilar shaders"; variar intensidade não recompila. RectAreaLight dá o brilho difuso realista de LED linear (não projeta sombra; as sombras vêm da luz principal).

## R8. Câmera e navegação

- **Decision**: `camera-controls` (yomotsu — listado em *awesome-threejs → Controls*) com `setLookAt(..., true)` para transições suaves ao selecionar produto; limites de ângulo polar e distância para não atravessar o piso.
- **Alternatives considered**: `OrbitControls` (sem transição animada nativa).

## R9. Rótulos e tela do cabeçote

- **Decision**: `CanvasTexture` gerada a partir dos campos do JSON (nome, tipo, idade, cores). A tela do cabeçote é um plano emissivo com canvas 1024×256 redesenhado ao selecionar.
- **Rationale**: mantém o princípio "dados dirigem a cena" e evita reproduzir logotipos.

## R10. Servidor local

- **Decision**: `serve.py` com `http.server.ThreadingHTTPServer`, MIME explícito para `.js/.mjs/.json/.hdr/.wasm`, cabeçalho `Cache-Control: no-store`, porta configurável, abertura opcional do navegador.
- **Rationale**: módulos ES exigem `text/javascript` e não carregam via `file://`; stdlib apenas.
