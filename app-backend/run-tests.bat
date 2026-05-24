@echo off
cd /d "%~dp0"
node --experimental-vm-modules node_modules/jest/bin/jest.js %*
