@echo off
chcp 65001 > nul
cd /d %~dp0
echo 正在启动 Bel Canto Score Search...
echo 如果提示 node 不是内部或外部命令，请先安装 Node.js 18+
echo.
npm start
pause
