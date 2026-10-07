#!/usr/bin/env python3
import subprocess
import signal
import os
from datetime import datetime
import rclpy
from rclpy.node import Node
from std_srvs.srv import SetBool

class BagRecorderNode(Node):
    def __init__(self):
        super().__init__('bag_recorder_node')
        self.record_proc = None
        self.bag_dir = os.path.expanduser('~/tactile_bags')
        os.makedirs(self.bag_dir, exist_ok=True)

        self.srv = self.create_service(SetBool, '/toggle_record', self.handle_toggle)
        self.get_logger().info('Bag Recorder Service ready at /toggle_record')

    def handle_toggle(self, request, response):
        if request.data:  # Request to START recording
            if self.record_proc is not None and self.record_proc.poll() is None:
                response.success = True
                response.message = "Already recording."
                return response

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            target_path = os.path.join(self.bag_dir, f"touch_bag_{timestamp}")

            # Record tactile topic in native mcap format
            cmd = ["ros2", "bag", "record", "/tactile_sensors", "-o", target_path]
            self.record_proc = subprocess.Popen(cmd, preexec_fn=os.setsid)

            self.get_logger().info(f"Started recording to {target_path}")
            response.success = True
            response.message = f"Recording started: touch_bag_{timestamp}"
        else:  # Request to STOP recording
            if self.record_proc is not None and self.record_proc.poll() is None:
                os.killpg(os.getpgid(self.record_proc.pid), signal.SIGINT)
                self.record_proc.wait(timeout=5)
                self.record_proc = None
                self.get_logger().info("Recording stopped cleanly.")
                response.success = True
                response.message = "Recording stopped and saved."
            else:
                response.success = False
                response.message = "No active recording process to stop."

        return response

def main(args=None):
    rclpy.init(args=args)
    node = BagRecorderNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        if node.record_proc is not None and node.record_proc.poll() is None:
            os.killpg(os.getpgid(node.record_proc.pid), signal.SIGINT)
        node.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    main()
