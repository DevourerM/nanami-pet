@echo off
setlocal
cd /d "%~dp0"
runtime\python.exe tts_server.py
