# Run commands to run
# chmod +x start.sh
# ./start_mac.sh


#!/bin/bash

clear

CYAN="\033[96m"
GREEN="\033[92m"
RESET="\033[0m"

echo -e "${CYAN}######################################"
echo "##     MAC STARTUP INITIATED       ##"
echo "######################################${RESET}"

# Launch API Server
osascript <<EOF
tell application "Terminal"
    do script "cd $(pwd) && echo 'Starting API Server...' && bun run src/index.ts"
end tell
EOF

# Launch Python Worker
osascript <<EOF
tell application "Terminal"
    do script "cd $(pwd) && echo 'Starting Python Worker...' && python3 src/worker/worker.py"
end tell
EOF

echo -e "${GREEN}[SUCCESS] Both windows triggered.${RESET}"

sleep 3
exit


