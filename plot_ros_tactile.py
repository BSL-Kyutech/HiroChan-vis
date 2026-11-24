#!/usr/bin/env python3
"""
Hiro-chan / Icepi Zero – ROS 2 Touch Sensor Live Scrolling Plot
Subscribes to /tactile_sensors (std_msgs/msg/Float32MultiArray)
"""

import collections
import threading
import rclpy
from rclpy.node import Node
from std_msgs.msg import Float32MultiArray
import matplotlib.pyplot as plt
import matplotlib.animation as animation

TOPIC_NAME = "/tactile_sensors"
HISTORY = 400
BASELINE_SAMPLES = 80
TOUCH_THRESHOLD = 0.04

class TactilePlotterNode(Node):
    def __init__(self):
        super().__init__('tactile_live_plotter')
        self.num_sensors = None
        self.lock = threading.Lock()

        self.baseline = []
        self.baseline_acc = []
        self.baseline_cnt = 0
        self.baseline_ready = False
        self.histories = []
        self.latest_raw = []

        self.sub = self.create_subscription(
            Float32MultiArray,
            TOPIC_NAME,
            self.listener_callback,
            10
        )
        self.get_logger().info(f"Subscribed to {TOPIC_NAME}. Waiting for data...")

    def capture_baseline(self):
        with self.lock:
            if self.num_sensors is None:
                return
            self.baseline_ready = False
            self.baseline_acc = [0.0] * self.num_sensors
            self.baseline_cnt = 0
            print("Capturing new baseline – keep hands off the sensors…")

    def listener_callback(self, msg: Float32MultiArray):
        data = list(msg.data)
        if not data:
            return

        with self.lock:
            if self.num_sensors is None:
                self.num_sensors = len(data)
                self.baseline = [0.0] * self.num_sensors
                self.baseline_acc = [0.0] * self.num_sensors
                self.histories = [
                    collections.deque([0.0] * HISTORY, maxlen=HISTORY)
                    for _ in range(self.num_sensors)
                ]
                self.latest_raw = [0.0] * self.num_sensors
                print(f"Detected {self.num_sensors} sensor channels on {TOPIC_NAME}")

            self.latest_raw = data

            if not self.baseline_ready:
                for i, v in enumerate(data):
                    self.baseline_acc[i] += v
                self.baseline_cnt += 1

                if self.baseline_cnt >= BASELINE_SAMPLES:
                    for i in range(self.num_sensors):
                        self.baseline[i] = self.baseline_acc[i] / self.baseline_cnt
                    self.baseline_ready = True
                    print("Baseline captured:", [round(b, 4) for b in self.baseline])

                for i in range(self.num_sensors):
                    self.histories[i].append(0.0)
            else:
                for i, v in enumerate(data):
                    corrected = max(0.0, v - self.baseline[i])
                    self.histories[i].append(corrected)


def main():
    rclpy.init()
    node = TactilePlotterNode()

    ros_thread = threading.Thread(target=rclpy.spin, args=(node,), daemon=True)
    ros_thread.start()

    print("Waiting for first message on /tactile_sensors...")
    while rclpy.ok() and node.num_sensors is None:
        plt.pause(0.1)

    if node.num_sensors is None:
        return

    num_sensors = node.num_sensors

    fig, ax = plt.subplots(figsize=(12, 6))
    ax.set_title(f"Hiro-chan – {num_sensors} Touch Sensors (ROS 2: {TOPIC_NAME})")
    ax.set_xlabel("Sample (newest on the right)")
    ax.set_ylabel("Value − baseline")
    ax.set_xlim(0, HISTORY - 1)
    ax.set_ylim(0, 0.25)
    ax.grid(True, alpha=0.3)

    colors = plt.cm.tab20.colors + plt.cm.tab20b.colors
    lines = []

    for i in range(num_sensors):
        (ln,) = ax.plot(
            range(HISTORY),
            [0.0] * HISTORY,
            color=colors[i % len(colors)],
            label=f"S{i+1}",
            linewidth=1.3
        )
        lines.append(ln)

    ax.legend(loc="upper right", ncol=4 if num_sensors <= 24 else 5, fontsize="x-small")

    status_text = ax.text(
        0.01, 0.97, "", transform=ax.transAxes,
        va="top", fontsize=9, family="monospace",
        bbox=dict(boxstyle="round", facecolor="wheat", alpha=0.8)
    )

    def update(_frame):
        with node.lock:
            for i, ln in enumerate(lines):
                ln.set_ydata(list(node.histories[i]))

            if node.baseline_ready:
                flags = " ".join(
                    f"[{i+1}]" if (v - node.baseline[i]) > TOUCH_THRESHOLD else f"{i+1}"
                    for i, v in enumerate(node.latest_raw)
                )
                status_text.set_text(f"Sensors: {flags}\n(press 'b' to re-baseline)")
            else:
                status_text.set_text(
                    f"Capturing baseline… {node.baseline_cnt}/{BASELINE_SAMPLES}"
                )

            all_vals = [v for h in node.histories for v in h]

        if all_vals:
            ymax = max(0.05, max(all_vals) * 1.3)      
            ax.set_ylim(0, ymax)

        return lines + [status_text]

    def on_key(event):
        if event.key == 'b':
            node.capture_baseline()

    fig.canvas.mpl_connect('key_press_event', on_key)

    ani = animation.FuncAnimation(
        fig, update, interval=30, blit=False, cache_frame_data=False
    )

    try:
        plt.show()
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()

if __name__ == "__main__":
    main()
