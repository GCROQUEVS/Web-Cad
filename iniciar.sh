#!/bin/sh
cd "$(dirname "$0")"
echo "WebCAD 2D em http://localhost:8000  (Ctrl+C para sair)"
(sleep 1; xdg-open http://localhost:8000 2>/dev/null || open http://localhost:8000 2>/dev/null) &
python3 -m http.server 8000
