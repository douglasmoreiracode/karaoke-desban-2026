# Karaokê Desban 2026

Catálogo de músicas para a Confraternização Desban 2026. Esta página temporária permite pesquisar músicas, filtrar por idioma, salvar favoritas no navegador e copiar os códigos do karaokê.

O projeto usa HTML, CSS e JavaScript, com os dados em JSON. A página funciona como um site estático e dispensa instalação de dependências e etapa de build.

## Estrutura

- `index.html` contém a página.
- `css/` e `js/` contêm os estilos e as interações.
- `assets/` contém a fonte e os elementos visuais usados pela página.
- `data/catalogo_karaoke.json` contém o catálogo.
- `vercel.json` configura a hospedagem estática a partir da raiz.

## Execução local

Na raiz do projeto, execute:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Abra `http://127.0.0.1:8000/` para que o navegador possa carregar o JSON por HTTP.
