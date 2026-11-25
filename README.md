# WebCAD 2D

Editor CAD 2D que roda no Google Chrome (ou em qualquer navegador moderno). Não tem build nem dependências: são só HTML, CSS e JavaScript (módulos ES), mais o leitor de DWG em WebAssembly.

## Como rodar
Os módulos ES e o WebAssembly **não funcionam abrindo o `index.html` com duplo clique** (`file://`). É preciso servir a pasta por HTTP:

- Windows: dê duplo clique em `iniciar.bat` (precisa do Python instalado)
- Linux/macOS: rode `./iniciar.sh`
- Ou, com Node instalado: `npx serve .`

Depois abra http://localhost:8000 no Chrome.

Também dá para publicar a pasta em qualquer hospedagem estática (GitHub Pages, Netlify, servidor da empresa etc.).

## Arquivos
| Formato | Abrir | Salvar/Exportar |
|---|---|---|
| DWG (R13 a 2018+) | ✔ via LibreDWG/WASM | ✘ (formato fechado; salve em DXF, que o AutoCAD abre) |
| DXF ASCII (R12 a 2018+) | ✔ | ✔ DXF 2000 e DXF R12 |
| PDF vetorial (plotagem com papel, escala e espessuras) | — | ✔ |
| SVG / PNG | — | ✔ |
| Navegador (IndexedDB) | ✔ | ✔ + autosalvamento a cada 60 s com recuperação |

Ctrl+S grava direto no arquivo original quando o navegador suporta a File System Access API (Chrome/Edge). Também dá para arrastar e soltar arquivos na área de desenho.

## Interface
Interface no estilo dos programas CAD de mesa (tema escuro):
- **Barra de título** com menu do aplicativo, barra de acesso rápido (novo, abrir, salvar, plotar, desfazer/refazer) e busca de comandos
- **Faixa de opções** com as abas Início, Inserir, Anotar, Vista, Gerenciar e Saída. Os botões grandes e pequenos têm variantes (▾), e o título de cada painel abre mais ferramentas. Em telas estreitas, os painéis da direita se recolhem. Clique duplo numa aba minimiza a faixa.
- **Abas de arquivos**: vários desenhos abertos ao mesmo tempo, mais a página Início
- **Paleta do gerenciador de camadas** flutuante e arrastável (`LA`) e **paleta de propriedades** (`Ctrl+1`)
- **Linha de comando flutuante** (`Ctrl+9` mostra/oculta, F2 abre o histórico)
- **Barra de status** com ícones (grade, snap, orto, polar, rastreamento, osnap, espessura de linha, entrada dinâmica, seleção de grupo, isolar objetos, escala de anotação)
- **Janelas de visualização** (1, 2, 3 ou 4 vistas lado a lado)

## Recursos
- **Desenho:** LINE, PLINE (com arcos e largura), CIRCLE (centro/raio, diâmetro, 2P, 3P, TTR), ARC (3P, início-centro-fim, início-fim-raio, centro-início-fim), RECTANG, POLYGON, ELLIPSE (inclusive arco elíptico), SPLINE, POINT (com estilo de ponto), XLINE, RAY, DONUT, REVCLOUD, WIPEOUT, TEXT, MTEXT, HATCH (14 padrões + sólido, contorno por ponto interno com ilhas), GRADIENT, BOUNDARY, TABLE (aceita colar do Excel)
- **Modificação:** MOVE, COPY, ROTATE, SCALE, MIRROR, OFFSET, TRIM/EXTEND, FILLET, CHAMFER, ARRAY (retangular, polar e em caminho), EXPLODE, JOIN, BREAK, BREAKATPOINT, STRETCH, LENGTHEN, ALIGN, MATCHPROP, PEDIT, DIVIDE, MEASURE, DRAWORDER, ERASE
- **Cotas:** DIM (inteligente: detecta linha, arco ou círculo), linear, alinhada, angular, comprimento de arco, raio, diâmetro, coordenada, contínua, linha de base, chamada, estilo de cota, escala de anotação
- **Blocos:** BLOCK, INSERT (com galeria e atributos), editor de bloco (BEDIT/BCLOSE), EATTEDIT, ATTDEF, WBLOCK, inserir arquivo DWG/DXF como bloco
- **Camadas:** paleta completa e ferramentas LAYOFF, LAYISO, LAYUNISO, LAYFRZ, LAYLCK, LAYULK, LAYON, LAYTHW, LAYMCUR, LAYMCH, LAYCUR, LAYDEL
- **Grupos:** GROUP, UNGROUP, seleção de grupo (gravados no DXF)
- **Seleção e consulta:** janela/cruzamento, QSELECT, SELECTSIMILAR, ocultar/isolar objetos, MEASUREGEOM, DIST, AREA, ID, LIST, COUNT
- **Texto:** estilo de texto (fonte), localizar e substituir
- **Imagem:** anexar PNG/JPG como referência (IMAGEATTACH)
- **Precisão:** snaps de objeto, ORTO, POLAR, rastreamento de snap (RASTR), grade e snap, entrada dinâmica, coordenadas `x,y`, `@dx,dy`, `@d<a`
- **Gerenciar:** PURGE, AUDIT, UNITS, opções
- **Desempenho:** índice espacial, cache de geometria, nível de detalhe e reaproveitamento de quadro durante pan/zoom. Testado com 200 mil objetos.

Os comandos aceitam os nomes e atalhos do AutoCAD em inglês e também nomes em português. Digite `AJUDA` (ou F1) para ver a lista.

## Limitações conhecidas
- Gravar em DWG não é possível no navegador. O DXF gerado abre no AutoCAD, BricsCAD, DraftSight, LibreCAD e QCAD.
- Imagens anexadas não vão para o DXF (só o contorno).
- Só o espaço modelo: layouts/espaço papel, viewports, sólidos 3D/ACIS (REGION, 3DSOLID), MLINE e TOLERANCE são ignorados na importação.
- Fontes SHX são substituídas por Arial.
- As cotas e hachuras não são associativas.

## Licenças
O código do WebCAD 2D é próprio. O leitor DWG em `vendor/libredwg` é o LibreDWG (GPL-2.0), compilado para WebAssembly pelo projeto @mlightcad/libredwg-web.
