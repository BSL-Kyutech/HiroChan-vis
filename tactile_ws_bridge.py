import asyncio
import json
import threading
import time

import rclpy
from rclpy.node import Node
from std_msgs.msg import Float32MultiArray
from rclpy.executors import SingleThreadedExecutor
import websockets


latest_data = []
data_lock = threading.Lock()
clients = set()


class TactileSubscriber(Node):
    def __init__(self):
        super().__init__('tactile_websocket_bridge')
        self.subscription = self.create_subscription(
            Float32MultiArray,
            '/tactile_sensors',
            self.sensor_callback,
            10
        )

    def sensor_callback(self, msg):
        global latest_data
        with data_lock:
            latest_data = [float(value) for value in msg.data]


async def websocket_handler(websocket, path):
    clients.add(websocket)
    print(f"Browser connected. Clients: {len(clients)}")
    try:
        await websocket.wait_closed()
    finally:
        clients.discard(websocket)
        print(f"Browser disconnected. Clients: {len(clients)}")


async def broadcast_loop():
    while True:
        with data_lock:
            values = latest_data.copy()

        if values and clients:
            payload = json.dumps({
                "data": values,
                "timestamp": time.time()
            })

            disconnected = set()
            for client in clients.copy():
                try:
                    await client.send(payload)
                except websockets.exceptions.ConnectionClosed:
                    disconnected.add(client)

            clients.difference_update(disconnected)

        await asyncio.sleep(0.05)  # 20 updates per second


async def main():
    server = await websockets.serve(
        websocket_handler,
        "127.0.0.1",
        8765
    )

    print("WebSocket server listening at ws://127.0.0.1:8765")

    try:
        await broadcast_loop()
    finally:
        server.close()
        await server.wait_closed()


def main_entry():
    rclpy.init()

    node = TactileSubscriber()
    executor = SingleThreadedExecutor()
    executor.add_node(node)

    ros_thread = threading.Thread(target=executor.spin, daemon=True)
    ros_thread.start()

    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopping WebSocket bridge...")
    finally:
        executor.shutdown()
        node.destroy_node()
        rclpy.shutdown()
        ros_thread.join(timeout=2)


if __name__ == '__main__':
    main_entry()
