# Análise das referências de garrafa e rótulo

As fotos de produto que o cliente enviou (`whiskys-bible-ref.zip`, pastas `ordem1` a `ordem10`)
servem **só de referência** de formato, cor do líquido e composição do rótulo. Elas não são
usadas como textura nem versionadas (são imagens de terceiros). Os rótulos da cena são
redesenhados em canvas por `src/scene/labelArt.js`.

As cores abaixo vêm da mediana de pixels de cada foto (`Pillow`), corrigidas à mão onde a
amostra caiu em reflexo ou texto. Fotos de estúdio usam luz por trás e deixam o líquido mais
saturado do que um material opaco consegue mostrar. Por isso o líquido usa a cor como albedo
e ganha um brilho emissivo leve, que simula a luz atravessando o whisky.

| # | Garrafa | Silhueta | Líquido | Cápsula / tampa | Composição do rótulo |
|---|---|---|---|---|---|
| 1 | Buffalo Trace | redonda, ombro médio, gargalo longo | `#c2400e` âmbar-avermelhado | sleeve verde-escuro `#1c3128` longo, filetes claros | faixa de papel rasgado `#dcc7a3` com bisão em sépia; nome em capitais creme impresso no vidro; "KENTUCKY STRAIGHT BOURBON WHISKEY" |
| 2 | Woodford Reserve | frasco achatado, ombro alto, gargalo curto | `#b9541c` âmbar-cobre | marrom `#6b5040` com tira vertical "ESTABLISHED 1812" | tudo impresso no vidro em creme/dourado: medalhão WR, "DISTILLER'S SELECT" em arco, "WOODFORD RESERVE" em capitais espaçadas; ticket creme `#ddd1bb` com lote/garrafa/teor |
| 3 | Jack Daniel's Old No. 7 | quadrada, ombro alto | `#e2691a` laranja vivo | tampa preta curta + gargantilha preta "OLD No.7 BRAND" | rótulo preto `#131312`, filetes brancos, "JACK DANIEL'S" em western arqueado, oval "OLD No 7 BRAND", "Tennessee", "SOUR MASH WHISKEY" |
| 4 | Jameson | redonda esbelta, ombro alto, gargalo longo, **vidro verde** `#3f6e32` | `#c88a2a` (pouco visível) | cápsula vermelha `#8a1a1c` + colar verde e selo vermelho "JJ&S" | papel creme `#f3e7d2` com topo verde `#1e5a38` e filete dourado; "JAMESON" verde com contorno vermelho; brasão vermelho; faixa verde inferior com assinatura dourada |
| 5 | Chivas Regal 12 | redonda larga, ombro arredondado | `#e39a1c` dourado | bordô `#7a120b` estampado + anel dourado | escudo prateado `#c9c8c6` com borda dourada `#bb8929`, faixa bordô "CHIVAS", emblema de nó, fita "REGAL"; faixa bordô "XII · AGED 12 YEARS" |
| 6 | Johnnie Walker Black Label | quadrada alta, ombro reto alto | `#d4702e` âmbar | tampa preta com assinatura | faixa preta inclinada a 24° com filetes dourados, "JOHNNIE WALKER", "BLACK LABEL" dourado; homem caminhando impresso; selo preto "AGED 12 YEARS" |
| 7 | Ballantine's Finest | retangular, ombro alto, gargalo curto | `#a5401a` âmbar-avermelhado escuro | cápsula creme `#e5e3cf` com script | papel creme `#e9e6c8` com corte em "V" no topo, brasão no ombro, "Ballantine's" em script azul-marinho, "FINEST" dourado, selo vermelho "B" |
| 8 | The Macallan 12 Double Cask | redonda alta, ombro suave | `#d78a45` âmbar claro | sleeve preto `#222` longo | etiqueta triangular "12 YEARS OLD" no ombro; rótulo branco `#f2f1ec` com filete preto, castelo, "THE MACALLAN" bordô `#8f1b22`, "12" grande |
| 9 | The Glenlivet Caribbean Reserve | redonda esbelta, gargalo longo | `#e8b24a` ouro claro | laranja-avermelhado `#c23c24` com "THE GLENLIVET" | parte superior creme com "THE GLENLIVET" e "CARIBBEAN RESERVE" laranja; faixa inferior laranja com medalhão dourado; medalhão "1824" no ombro |
| 10 | Hibiki Japanese Harmony | **24 facetas**, baixa e larga, fundo grosso | `#f0a01a` âmbar-dourado | **rolha de vidro facetada** + gargantilha `#392614` com filete roxo | washi `#eee9e4` com fibras; ideograma 響 em pincel; "HIBIKI", "SUNTORY WHISKY", "JAPANESE HARMONY" dourado |
