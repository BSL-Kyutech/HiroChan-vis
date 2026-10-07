#!/usr/bin/env bash

source /opt/ros/jazzy/setup.bash 2>/dev/null || source /opt/ros/humble/setup.bash 2>/dev/null || source /opt/ros/iron/setup.bash 2>/dev/null

BAG_DIR="$HOME/tactile_bags"

# Find the newest .mcap or .db3 file inside the bags directory
TARGET_FILE=$(find "$BAG_DIR" -type f \( -name "*.mcap" -o -name "*.db3" \) -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -f2- -d" ")

if [ -z "$TARGET_FILE" ]; then
    echo "Error: No recorded files found in $BAG_DIR"
    exit 1
fi

echo "=========================================="
echo " Playing back on loop: $TARGET_FILE"
echo " Press Ctrl + C to stop playback"
echo "=========================================="

if [[ "$TARGET_FILE" == *.mcap ]]; then
    ros2 bag play -i "$TARGET_FILE" mcap --loop
else
    ros2 bag play -i "$TARGET_FILE" sqlite3 --loop
fi
