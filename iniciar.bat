@echo off
cd /d "%~dp0"
echo WebCAD 2D em http://localhost:8000
start "" http://localhost:8000
python -m http.server 8000 || py -m http.server 8000
pause
