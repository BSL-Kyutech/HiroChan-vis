#!/usr/bin/env bash

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source ROS 2 environment
source /opt/ros/jazzy/setup.bash 2>/dev/null || source /opt/ros/humble/setup.bash 2>/dev/null

echo "Cleaning up lingering ports (9090)..."
fuser -k 9090/tcp 2>/dev/null

echo "[1/3] Starting ROS Bridge (port 9090)..."
ros2 launch rosbridge_server rosbridge_websocket_launch.xml &
BRIDGE_PID=$!

echo "[2/3] Starting Web Bag Recorder Service..."
python3 "$REPO_DIR/scripts/bag_recorder_node.py" &
REC_PID=$!

echo "[3/3] Starting Vite Three.js Dev Server..."
cd "$REPO_DIR" && npm run dev &
VITE_PID=$!

cleanup() {
echo -e "\nShutting down Hiro-chan stack..."
kill $BRIDGE_PID $REC_PID $VITE_PID 2>/dev/null
fuser -k 9090/tcp 2>/dev/null
exit 0
}

trap cleanup SIGINT SIGTERM

echo "=========================================================="
echo " Hiro-chan Full Stack is running!"
echo " Open http://localhost:5173 in your browser"
echo " Press Ctrl + C to stop all services."
echo "=========================================================="
wait
