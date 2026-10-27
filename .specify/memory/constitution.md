# Gôndola 3D Whisky Constitution

## Core Principles

### I. Dados Dirigem a Cena (Data-Driven)
Toda informação de produto (nome, descrição, preço, cores da garrafa, disponibilidade)
vive exclusivamente em `data/whiskies.json`. O código 3D e a interface NUNCA embutem
dados de produto. Alterar o JSON (inclusive o campo booleano `disponivel`) deve bastar
para mudar o que aparece na gôndola, sem tocar em código.

### II. Realismo Físico (PBR)
Materiais usam fluxo PBR (`MeshStandardMaterial`/`MeshPhysicalMaterial`) com texturas
fotorrealistas CC0 do Poly Haven, sempre com **mapa de cor + normal map (OpenGL) +
roughness** e, quando houver, ambient occlusion. Mapas de cor em sRGB; mapas de dados em
espaço linear. Iluminação com unidades físicas, tone mapping e sombras via shadow map.

### III. Zero Build, Execução Local Trivial
O projeto roda com `python serve.py` e um navegador moderno — sem bundler, sem
`npm install` obrigatório. Bibliotecas de terceiros ficam versionadas em `vendor/` e são
resolvidas por `importmap`. Assets (texturas/HDRI) ficam em `assets/` para funcionar offline.

### IV. Lógica Pura Testável
Regras de negócio (validação do catálogo e algoritmo de arranjo das prateleiras) ficam em
módulos ES puros, sem dependência de three.js nem do DOM, cobertos por testes `node --test`.
A cena apenas consome o resultado desses módulos.

### V. Performance Consciente
Seguir as boas práticas de three.js (katopz/best-practices → discoverthreejs tips):
reutilizar geometrias/materiais, instanciar objetos repetidos (`InstancedMesh`), limitar o
pixel ratio, não adicionar/remover luzes em tempo de execução (variar intensidade), atualizar
o shadow map apenas quando a cena muda, e descartar (`dispose`) recursos removidos.
Meta: 60 fps em notebook com GPU integrada a 1080p.

## Restrições Adicionais

- Stack: HTML + CSS + JavaScript (ES2022 modules), three.js r186, camera-controls e lil-gui.
- Servidor: Python 3.9+ apenas com biblioteca padrão.
- Idioma da interface e da documentação: Português (Brasil).
- Marcas são representadas apenas por texto nos rótulos gerados proceduralmente; nenhum
  logotipo ou arte oficial é copiado. Preços são ilustrativos.
- Lista de produtos é fixa nesta versão: a UI não adiciona nem remove itens do JSON, apenas
  remove/repõe prateleiras na sessão.

## Fluxo de Desenvolvimento

- Especificação antes do código: `spec.md` → `plan.md` → `tasks.md` (Spec Kit) e só então
  implementação. Toda mudança de escopo atualiza primeiro a spec.
- Branch de trabalho: `develop`. Commits pequenos e descritivos.
- Gate de qualidade: `node --test` verde e smoke test do navegador sem erros de console.

## Governance

Esta constituição prevalece sobre preferências individuais de implementação. Emendas exigem
atualizar este arquivo, incrementar a versão e registrar o motivo no commit. Toda revisão
verifica aderência aos princípios I–V; complexidade extra deve ser justificada no
`plan.md` (seção Complexity Tracking).

**Version**: 1.0.0 | **Ratified**: 2026-10-27 | **Last Amended**: 2026-10-27
