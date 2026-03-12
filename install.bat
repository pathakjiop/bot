@echo off
echo ===================================================
echo   Service Bot - Automatic Installation (Windows)
echo ===================================================

echo.
echo [1/3] Detecting runtime...
where bun >nul 2>nul
if %errorlevel% equ 0 (
    echo Bun detected. Using Bun for installation.
    call bun install
) else (
    echo Bun not found. Using NPM.
    call npm install
)

echo.
echo [2/3] Installing Python dependencies...
pip install -r requirements.txt
playwright install

echo.
echo [3/3] Creating .env file (if not exists)...
if not exist .env (
    copy .env.example .env
    echo Created .env from example. Please edit it with your credentials.
) else (
    echo .env file already exists. Skipping.
)

echo.
echo ===================================================
echo   Installation Complete!
echo   Please ensure PostgreSQL and RabbitMQ are running.
echo   Run 'bun run dev' or 'npm run dev' to start.
echo ===================================================
pause
