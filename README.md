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

## Recursos
- **Desenho:** LINE, PLINE (com arcos e largura), CIRCLE (centro/raio, diâmetro, 2P, 3P, TTR), ARC (3P, centro, fim+raio), RECTANG (com filete), POLYGON, ELLIPSE (inclusive arco elíptico), SPLINE, POINT, XLINE, RAY, DONUT, REVCLOUD, TEXT, MTEXT, HATCH (14 padrões + sólido; contorno por ponto interno com ilhas, ou por seleção de objetos), BOUNDARY
- **Modificação:** MOVE, COPY (com matriz), ROTATE e SCALE (com Copiar/Referência), MIRROR, OFFSET (distância/através), TRIM e EXTEND (Shift alterna entre os dois), FILLET (linhas e polilinha), CHAMFER, ARRAY (retangular/polar), EXPLODE, JOIN, BREAK, BREAKATPOINT, STRETCH, LENGTHEN, ALIGN, MATCHPROP, PEDIT, DIVIDE, MEASURE, DRAWORDER, ERASE
- **Cotas:** linear, alinhada, raio, diâmetro, angular, contínua, linha de base, chamada (leader), estilo de cota
- **Blocos:** BLOCK, INSERT (com atributos), ATTDEF, WBLOCK; blocos e atributos importados do DXF/DWG
- **Camadas:** gerenciador completo (ligar/desligar, congelar, bloquear, cor ACI ou RGB, tipo de linha, espessura, plotar); tipos de linha tracejados; espessuras de linha
- **Precisão:** snaps de objeto (extremidade, ponto médio, centro, quadrante, interseção, perpendicular, tangente, mais próximo, nó, inserção, extensão), ORTO, rastreamento POLAR, grade e snap, entrada dinâmica, coordenadas absolutas/relativas/polares (`x,y`, `@dx,dy`, `@d<a`), entrada direta de distância, snaps pontuais (`END`, `MID`...)
- **Edição:** seleção por janela e por cruzamento, grips (esticar/mover/rotacionar/escalar/espelhar), paleta de propriedades, desfazer/refazer ilimitado, área de transferência, menu de contexto
- **Consulta:** DIST, AREA, ID, LIST, COUNT
- **Desempenho:** índice espacial, cache de geometria, nível de detalhe e reaproveitamento de quadro durante pan/zoom. Testado com 200 mil objetos.

Os comandos aceitam os nomes e atalhos do AutoCAD em inglês (L, C, TR, O...) e também nomes em português. Digite `AJUDA` (ou F1) para ver a lista completa.

## Limitações conhecidas
- Gravar em DWG não é possível no navegador. O DXF gerado abre no AutoCAD, BricsCAD, DraftSight, LibreCAD e QCAD.
- Só o espaço modelo: layouts/espaço papel, viewports, sólidos 3D/ACIS (REGION, 3DSOLID), MLINE e TOLERANCE são ignorados na importação.
- Fontes SHX são substituídas por Arial.
- As cotas e hachuras não são associativas.

## Licenças
O código do WebCAD 2D é próprio. O leitor DWG em `vendor/libredwg` é o LibreDWG (GPL-2.0), compilado para WebAssembly pelo projeto @mlightcad/libredwg-web.
