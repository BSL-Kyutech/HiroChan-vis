/* cd ~/threejs-project
npm run dev */

import ROSLIB from 'roslib';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// 1. Scene setup & background
const scene = new THREE.Group();
scene.background = new THREE.Color(0x1a1a1a);

// sensor 1-10: left arm
// sensor 4: elbow
//20-30: right arm
// 3 was touched 

// 2. Camera setup
const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.01,
    1000
);
camera.position.set(0, 6, 8);

// 3. Renderer with color management
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); //Makes the 3D render look razor-sharp on high-resolution screens without crashing your computer's performance
renderer.outputColorSpace = THREE.SRGBColorSpace; //Ensures textures and surface colors look exactly as the 3D artist designed them, rather than washed-out or unnaturally dark
renderer.toneMapping = THREE.ACESFilmicToneMapping; //Mimics how a real-world movie camera handles bright sunlight and deep shadows.
document.body.appendChild(renderer.domElement);

// 4. Interactive camera controls
const controls = new OrbitControls(camera, renderer.domElement); //Binds mouse and touch listeners directly to your canvas (renderer.domElement) and gives them permission to move your camera
controls.enableDamping = true; //Adds simulated friction and physical weight (damping) to the camera's movement.

// Add ambient baseline light
scene.add(new THREE.AmbientLight(0xffffff, 1.0));

// Attach a directional light directly to the camera
const headlight = new THREE.DirectionalLight(0xffffff, 2.0);
headlight.position.set(0, 0, 1); // Shines straight forward from the lens
camera.add(headlight);

// IMPORTANT: When adding children to the camera, you must add the camera to the scene:
scene.add(camera);

// 6. Model loading with automatic centering & framing
const loader = new GLTFLoader();

loader.load(
    '/models/hiro-chan.glb',
    (gltf) => {
        const robot = gltf.scene;

        robot.traverse((object) => {
            console.log(object.name, object.type);
        });

        // Auto-center model at scene origin
        const box = new THREE.Box3().setFromObject(robot);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        robot.position.sub(center);
        scene.add(robot);

        // Create a tactile sensor marker
        const sensorGeometry = new THREE.SphereGeometry(0.15, 16, 16);

        const sensorMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000
        });

        

        robot.add(sensor);

        // Auto-frame camera based on model dimensions
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.6;

        camera.position.set(0, maxDim * 0.2, cameraZ);
        controls.target.set(0, 0, 0);
        controls.update();

        robot.rotation.y = 0;
    },
    (progress) => {
        if (progress.total > 0) {
            console.log(`Loading: ${Math.round((progress.loaded / progress.total) * 100)}%`);
        }
    },
    (error) => {
        console.error('Failed to load GLTF model:', error);
    }
);

// 7. Responsive resize listener
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; //If the window gets wider or narrower, the ratio between width and height changes. so to keep it still
    camera.updateProjectionMatrix();// Three.js caches the camera's internal math (its projection matrix) for performance reasons so it doesn't recalculate it on every single frame
    renderer.setSize(window.innerWidth, window.innerHeight);
})

// 8. Render loop
renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
});
