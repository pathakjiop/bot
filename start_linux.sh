# Run commands to run
# chmod +x start.sh
# ./start_linux.sh


#!/bin/bash

clear

CYAN="\033[96m"
GREEN="\033[92m"
RESET="\033[0m"

echo -e "${CYAN}######################################"
echo "##     LINUX STARTUP INITIATED     ##"
echo "######################################${RESET}"

CURRENT_DIR="$(pwd)"

start_terminal () {
    if command -v gnome-terminal >/dev/null 2>&1; then
        gnome-terminal -- bash -c "$1; exec bash"

    elif command -v konsole >/dev/null 2>&1; then
        konsole -e bash -c "$1; exec bash"

    elif command -v xfce4-terminal >/dev/null 2>&1; then
        xfce4-terminal --command="bash -c '$1; exec bash'"

    elif command -v xterm >/dev/null 2>&1; then
        xterm -hold -e "$1"

    else
        echo "No GUI terminal found. Running in background..."
        bash -c "$1" &
    fi
}

# Launch API Server
start_terminal "cd $CURRENT_DIR && echo 'Starting API Server...' && bun run src/index.ts"

# Launch Python Worker
start_terminal "cd $CURRENT_DIR && echo 'Starting Python Worker...' && python3 src/worker/worker.py"

echo -e "${GREEN}[SUCCESS] Both windows triggered.${RESET}"

sleep 3
exit
