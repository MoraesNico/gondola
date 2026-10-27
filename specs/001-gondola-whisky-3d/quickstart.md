# Quickstart: Gôndola 3D de Whisky

## Rodar

```bash
git clone -b develop https://github.com/MoraesNico/gondola.git
cd gondola
python serve.py          # abre http://127.0.0.1:8000 no navegador
python serve.py --port 9000 --no-browser
```

## Validar os cenários da spec

| # | Passo | Resultado esperado |
|---|---|---|
| 1 | Abrir a página | 9 prateleiras (Hibiki começa indisponível) em 2 módulos 5 + 4, sombras visíveis |
| 2 | Arrastar / rolar | câmera orbita e aproxima; não atravessa o piso |
| 3 | Painel → "Ver na gôndola" em Macallan | câmera enquadra a prateleira; cabeçote mostra "The Macallan 12" e preço |
| 4 | Clicar numa garrafa de Jameson | painel destaca o card de Jameson |
| 5 | Remover 4 prateleiras | gôndola anima para 1 módulo com 5 prateleiras |
| 6 | Tentar remover a última | aviso "A gôndola precisa de ao menos uma prateleira" |
| 7 | "Restaurar tudo" | volta ao estado do JSON |
| 8 | Painel de iluminação → LEDs off, sombra 4096, exposição | efeito imediato |
| 9 | Editar `data/whiskies.json`: `"disponivel": true` no Hibiki, recarregar | 10 prateleiras, 5 + 5 |

## Testes automatizados

```bash
node --test                      # catálogo + arranjo
python -m unittest discover -s tests -p "test_*.py"   # servidor
node tests/smoke.mjs            # opcional: requer Playwright; gera screenshots/
```
