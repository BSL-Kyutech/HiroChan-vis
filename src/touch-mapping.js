
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Logical positions only. Hardware sensor IDs are assigned later.
export const touchPoints = [
  // Head near the ears: 4
  { id: "head_upper_left", region: "Head near ears", side: "left", surface: "side", x: -0.27, y: 0.88, z: 0.05 },
  { id: "head_upper_right", region: "Head near ears", side: "right", surface: "side", x: 0.27, y: 0.88, z: 0.05 },
  { id: "head_lower_left", region: "Head near ears", side: "left", surface: "side", x: -0.36, y: 0.73, z: 0.05 },
  { id: "head_lower_right", region: "Head near ears", side: "right", surface: "side", x: 0.36, y: 0.73, z: 0.05 },

  // Rear head: 4 larger patches
  { id: "rear_head_upper_left", region: "Rear head", side: "left", surface: "back", x: -0.23, y: 0.91, z: -0.25, size: 0.085 },
  { id: "rear_head_upper_right", region: "Rear head", side: "right", surface: "back", x: 0.23, y: 0.91, z: -0.25, size: 0.085 },
  { id: "rear_head_lower_left", region: "Rear head", side: "left", surface: "back", x: -0.23, y: 0.76, z: -0.30, size: 0.085 },
  { id: "rear_head_lower_right", region: "Rear head", side: "right", surface: "back", x: 0.23, y: 0.76, z: -0.30, size: 0.085 },

  // Front upper body: 6
  { id: "front_upper_left", region: "Front upper body", side: "left", surface: "front", x: -0.20, y: 0.56, z: 0.25 },
  { id: "front_upper_right", region: "Front upper body", side: "right", surface: "front", x: 0.20, y: 0.56, z: 0.25 },
  { id: "front_middle_left", region: "Front upper body", side: "left", surface: "front", x: -0.20, y: 0.46, z: 0.28 },
  { id: "front_middle_right", region: "Front upper body", side: "right", surface: "front", x: 0.20, y: 0.46, z: 0.28 },
  { id: "front_lower_left", region: "Front upper body", side: "left", surface: "front", x: -0.18, y: 0.36, z: 0.28 },
  { id: "front_lower_right", region: "Front upper body", side: "right", surface: "front", x: 0.18, y: 0.36, z: 0.28 },

  // Back upper body: 6
  { id: "back_upper_left", region: "Back upper body", side: "left", surface: "back", x: -0.20, y: 0.56, z: -0.25 },
  { id: "back_upper_right", region: "Back upper body", side: "right", surface: "back", x: 0.20, y: 0.56, z: -0.25 },
  { id: "back_middle_left", region: "Back upper body", side: "left", surface: "back", x: -0.20, y: 0.46, z: -0.28 },
  { id: "back_middle_right", region: "Back upper body", side: "right", surface: "back", x: 0.20, y: 0.46, z: -0.28 },
  { id: "back_lower_left", region: "Back upper body", side: "left", surface: "back", x: -0.18, y: 0.36, z: -0.28 },
  { id: "back_lower_right", region: "Back upper body", side: "right", surface: "back", x: 0.18, y: 0.36, z: -0.28 },

  // Arms: 8
  { id: "left_arm_front_1", region: "Left arm", side: "left", surface: "front", x: -0.40, y: 0.52, z: 0.20 },
  { id: "left_arm_front_2", region: "Left arm", side: "left", surface: "front", x: -0.45, y: 0.44, z: 0.20 },
  { id: "left_arm_back_1", region: "Left arm", side: "left", surface: "back", x: -0.40, y: 0.52, z: -0.15 },
  { id: "left_arm_back_2", region: "Left arm", side: "left", surface: "back", x: -0.45, y: 0.44, z: -0.15 },
  { id: "right_arm_front_1", region: "Right arm", side: "right", surface: "front", x: 0.40, y: 0.52, z: 0.20 },
  { id: "right_arm_front_2", region: "Right arm", side: "right", surface: "front", x: 0.45, y: 0.44, z: 0.20 },
  { id: "right_arm_back_1", region: "Right arm", side: "right", surface: "back", x: 0.40, y: 0.52, z: -0.15 },
  { id: "right_arm_back_2", region: "Right arm", side: "right", surface: "back", x: 0.45, y: 0.44, z: -0.15 },

  // Left leg and foot: 6
  { id: "left_leg_front_1", region: "Left leg and foot", side: "left", surface: "front", x: -0.30, y: 0.19, z: 0.25 },
  { id: "left_leg_front_2", region: "Left leg and foot", side: "left", surface: "front", x: -0.35, y: 0.12, z: 0.25 },
  { id: "left_foot_sole", region: "Left leg and foot", side: "left", surface: "sole", x: -0.38, y: 0.04, z: 0.10 },
  { id: "left_foot_back_1", region: "Left leg and foot", side: "left", surface: "back", x: -0.30, y: 0.12, z: -0.20 },
  { id: "left_foot_back_2", region: "Left leg and foot", side: "left", surface: "back", x: -0.35, y: 0.09, z: -0.20 },
  { id: "left_foot_back_3", region: "Left leg and foot", side: "left", surface: "back", x: -0.40, y: 0.06, z: -0.15 },

  // Right leg and foot: 6
  { id: "right_leg_front_1", region: "Right leg and foot", side: "right", surface: "front", x: 0.30, y: 0.19, z: 0.25 },
  { id: "right_leg_front_2", region: "Right leg and foot", side: "right", surface: "front", x: 0.35, y: 0.12, z: 0.25 },
  { id: "right_foot_sole", region: "Right leg and foot", side: "right", surface: "sole", x: 0.38, y: 0.04, z: 0.10 },
  { id: "right_foot_back_1", region: "Right leg and foot", side: "right", surface: "back", x: 0.30, y: 0.12, z: -0.20 },
  { id: "right_foot_back_2", region: "Right leg and foot", side: "right", surface: "back", x: 0.35, y: 0.09, z: -0.20 },
  { id: "right_foot_back_3", region: "Right leg and foot", side: "right", surface: "back", x: 0.40, y: 0.06, z: -0.15 },
];

export function addTouchMarkers(model, onSelect = () => {}) {
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());

  const markers = new THREE.Group();
  markers.name = "TouchMarkers";

  const radius = Math.max(size.x, size.y, size.z) * 0.012;

  for (const point of touchPoints) {
    // Coordinates are normalized relative to the GLB bounds.
    // These are initial estimates and must be calibrated.
    const position = new THREE.Vector3(
      center.x + point.x * size.x,
      bounds.min.y + point.y * size.y,
      center.z + point.z * size.z
    );

    const geometry = new THREE.SphereGeometry(
      point.size ? radius * (point.size / 0.012) : radius,
      16,
      12
    );

    const material = new THREE.MeshStandardMaterial({
      color: 0x00cc88,
      emissive: 0x003322,
      roughness: 0.4,
    });

    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(position);
    marker.name = point.id;
    marker.userData.touchPoint = point;
    marker.userData.sensorId = null;

    marker.callback = () => onSelect(point);
    markers.add(marker);
  }

  model.add(markers);
  return markers;
}

export function setTouchActive(markers, logicalId, active) {
  const marker = markers.getObjectByName(logicalId);
  if (!marker) return;

  marker.material.color.set(active ? 0xff5533 : 0x00cc88);
  marker.material.emissive.set(active ? 0x661100 : 0x003322);
}
