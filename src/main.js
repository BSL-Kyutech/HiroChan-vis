/* cd ~/threejs-project
npm run dev */

/* terminal 1 */
/* source /opt/ros/jazzy/setup.bash
source ~/ros2_ws/install/setup.bash */

/* terminal 2 */

/* source /opt/ros/jazzy/setup.bash
ros2 run rosbridge_server rosbridge_websocket */

/* terminal 3 */

/* source /opt/ros/jazzy/setup.bash
source ~/ros2_ws/install/setup.bash
ros2 run tactile_backend sensor_simulator */

/* terminal 4 */

/* cd ~/threejs-project
npm run dev */


import * as ROSLIB from 'roslib';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// -------------------------------------------------------------
// 1. ROS 2 Bridge Connection
// -------------------------------------------------------------
const ros = new ROSLIB.Ros({
    url: 'ws://localhost:9090'
});

ros.on('connection', () => console.log('Connected to rosbridge'));
ros.on('error', (err) => console.log('ROS error:', err));
ros.on('close', () => console.log('ROS connection closed'));

const tactileTopic = new ROSLIB.Topic({
    ros: ros,
    name: '/tactile_sensors',
    messageType: 'std_msgs/msg/Float32MultiArray'
});

// -------------------------------------------------------------
// 2. Constants & Data Buffers
// -------------------------------------------------------------
const NUM_TAXELS = 24;

// Target intensities updated from ROS 2
const targetIntensities = new Float32Array(NUM_TAXELS);

// Current smoothed intensities for the GPU
const liveIntensities = new Float32Array(NUM_TAXELS);

// Local surface coordinates on Hiro-chan (fallback default array)
let taxelLocalPositions = Array.from({ length: NUM_TAXELS }, () => new THREE.Vector3(999.0, 999.0, 999.0));

// World coordinates updated each frame
const taxelWorldPositions = Array.from({ length: NUM_TAXELS }, () => new THREE.Vector3(999.0, 999.0, 999.0));

// -------------------------------------------------------------
// 3. Three.js Scene, Camera & WebGL Renderer
// -------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.01,
    1000
);
camera.position.set(0, 1.8, 3.2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Lighting setup
scene.add(new THREE.AmbientLight(0xffffff, 0.7));

const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
dirLight.position.set(2, 4, 3);
scene.add(dirLight);

const headlight = new THREE.DirectionalLight(0xffffff, 1.2);
headlight.position.set(0, 0, 1);
camera.add(headlight);
scene.add(camera);

scene.add(new THREE.GridHelper(4, 12, 0x444444, 0x222222));

// -------------------------------------------------------------
// 4. Multi-Taxel GPU Shader
// -------------------------------------------------------------
const touchUniforms = {
    uTaxelPos: { value: taxelWorldPositions },
    uTaxelIntensity: { value: liveIntensities },
    uRadius: { value: 0.16 },  // Contact spread per sensor
    uDepth: { value: 0.12 }   // Physical dent depth
};

function setupDeformableMaterial(mat) {
    mat.roughness = 0.35;
    mat.metalness = 0.05;

    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTaxelPos = touchUniforms.uTaxelPos;
        shader.uniforms.uTaxelIntensity = touchUniforms.uTaxelIntensity;
        shader.uniforms.uRadius = touchUniforms.uRadius;
        shader.uniforms.uDepth = touchUniforms.uDepth;

        // Vertex Shader: Multi-taxel displacement
        shader.vertexShader = `
            #define NUM_TAXELS 24
            uniform vec3 uTaxelPos[NUM_TAXELS];
            uniform float uTaxelIntensity[NUM_TAXELS];
            uniform float uRadius;
            uniform float uDepth;
            varying vec3 vWorldPos;
            varying float vTotalIntensity;
        ` + shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            vec4 worldP = modelMatrix * vec4(position, 1.0);
            vWorldPos = worldP.xyz;
            vTotalIntensity = 0.0;

            float netDisp = 0.0;
            vec3 accumSlope = vec3(0.0);

            for (int i = 0; i < NUM_TAXELS; i++) {
                float intensity = uTaxelIntensity[i];
                if (intensity > 0.01) {
                    float d = distance(worldP.xyz, uTaxelPos[i]);
                    if (d < uRadius) {
                        vec3 localTouch = (inverse(modelMatrix) * vec4(uTaxelPos[i], 1.0)).xyz;
                        vec3 toTouch = localTouch - position;
                        vec3 dirToTouch = normalize(toTouch);

                        // Normal gating: only deform front-facing surface
                        float front = max(0.0, dot(normal, dirToTouch));
                        float r = d / uRadius;

                        // Cosine indentation profile
                        float falloff = 0.5 * (1.0 + cos(r * 3.14159265)) * intensity * front;
                        netDisp += falloff;

                        // Surface slope tilt
                        vec3 tangent = normalize(toTouch - normal * dot(toTouch, normal));
                        accumSlope += tangent * (falloff * 2.0);

                        vTotalIntensity += falloff;
                    }
                }
            }

            netDisp = min(netDisp, 1.5);
            transformed -= normal * (netDisp * uDepth);
            objectNormal = normalize(objectNormal + accumSlope);
            vTotalIntensity = clamp(vTotalIntensity, 0.0, 1.0);
            `
        );

        // Fragment Shader: Heatmap gradient
        shader.fragmentShader = `
            varying vec3 vWorldPos;
            varying float vTotalIntensity;

            vec3 getTactileColor(float t) {
                vec3 c0 = vec3(0.10, 0.25, 0.85); // Blue
                vec3 c1 = vec3(0.10, 0.75, 0.65); // Cyan
                vec3 c2 = vec3(0.95, 0.80, 0.15); // Yellow
                vec3 c3 = vec3(0.92, 0.25, 0.10); // Red
                if (t < 0.33) return mix(c0, c1, t / 0.33);
                if (t < 0.66) return mix(c1, c2, (t - 0.33) / 0.33);
                return mix(c2, c3, (t - 0.66) / 0.34);
            }
        ` + shader.fragmentShader;

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            `
            #include <dithering_fragment>
            if (vTotalIntensity > 0.01) {
                float p = vTotalIntensity;
                vec3 heat = getTactileColor(p);

                // Topographic isobar rings
                float rings = mod(p * 7.0, 1.0);
                if (rings > 0.88) {
                    heat = mix(heat, vec3(0.05), 0.45);
                }

                gl_FragColor.rgb = mix(gl_FragColor.rgb, heat, p * 0.92);
            }
            `
        );
    };

    mat.needsUpdate = true;
}

// -------------------------------------------------------------
// 5. Model Loading
// -------------------------------------------------------------
let robot = null;
const robotMeshes = [];
const loader = new GLTFLoader();

loader.load(
    '/models/hiro-chan.glb',
    (gltf) => {
        console.log('Hiro-chan loaded');
        robot = gltf.scene;

        robot.traverse((child) => {
            if (child.isMesh && child.geometry) {
                child.geometry.computeVertexNormals();
                child.geometry.computeBoundingBox();
                child.geometry.computeBoundingSphere();

                robotMeshes.push(child);
                child.material = child.material.clone();
                child.material.side = THREE.DoubleSide;
                setupDeformableMaterial(child.material);
            }
        });

        const box = new THREE.Box3().setFromObject(robot);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        robot.position.sub(center);
        scene.add(robot);
        robot.updateMatrixWorld(true);

        const maxDim = Math.max(size.x, size.y, size.z);
        camera.position.set(0, maxDim * 0.35, maxDim * 1.6);
        controls.target.set(0, 0, 0);
        controls.update();

        // Check if saved calibration exists in localStorage
        loadSavedCalibration();
    }
);

// -------------------------------------------------------------
// 6. Interactive Calibration Tool (UI & Pin Markers)
// -------------------------------------------------------------
let calibrationActive = false;
let currentCalibIndex = 0;
const markerGroup = new THREE.Group();
scene.add(markerGroup);

function createMarkerPin(index, pos) {
    const geom = new THREE.SphereGeometry(0.018, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(pos);
    mesh.name = `marker_S${index}`;
    markerGroup.add(mesh);
}

function updateMarkerPositions() {
    if (!robot) return;
    markerGroup.clear();
    for (let i = 0; i < NUM_TAXELS; i++) {
        if (taxelLocalPositions[i].x !== 999.0) {
            const worldPos = taxelLocalPositions[i].clone().applyMatrix4(robot.matrixWorld);
            createMarkerPin(i, worldPos);
        }
    }
}

// Calibration UI Overlay
const ui = document.createElement('div');
ui.style.position = 'fixed';
ui.style.top = '15px';
ui.style.left = '15px';
ui.style.zIndex = '9999';
ui.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
ui.style.color = '#fff';
ui.style.fontFamily = 'monospace';
ui.style.padding = '14px 18px';
ui.style.borderRadius = '8px';
ui.style.lineHeight = '1.6';
ui.innerHTML = `
    <div style="font-weight:bold; font-size:14px; margin-bottom:6px; color:#00ffcc;">TAXEL CALIBRATION</div>
    <div id="calib-status">Mode: Normal Visualization</div>
    <div style="margin-top:10px; display:flex; gap:8px;">
        <button id="btn-toggle-calib" style="cursor:pointer; padding:5px 10px; background:#00ffcc; border:none; border-radius:4px; font-weight:bold;">Start Calib</button>
        <button id="btn-export-json" style="cursor:pointer; padding:5px 10px; background:#444; color:#fff; border:none; border-radius:4px;">Export JSON</button>
        <button id="btn-clear-calib" style="cursor:pointer; padding:5px 10px; background:#662222; color:#fff; border:none; border-radius:4px;">Reset</button>
    </div>
`;
document.body.appendChild(ui);

const statusDiv = document.getElementById('calib-status');
const toggleBtn = document.getElementById('btn-toggle-calib');
const exportBtn = document.getElementById('btn-export-json');
const clearBtn = document.getElementById('btn-clear-calib');

toggleBtn.addEventListener('click', () => {
    calibrationActive = !calibrationActive;
    if (calibrationActive) {
        toggleBtn.textContent = 'Finish Calib';
        toggleBtn.style.background = '#ffaa00';
        statusDiv.innerHTML = `<span style="color:#ffaa00;">Click Hiro-chan for: <b>S${currentCalibIndex}</b></span>`;
    } else {
        toggleBtn.textContent = 'Start Calib';
        toggleBtn.style.background = '#00ffcc';
        statusDiv.textContent = 'Mode: Normal Visualization';
    }
});

exportBtn.addEventListener('click', () => {
    const exportData = taxelLocalPositions.map((v, i) => ({
        id: i,
        x: Number(v.x.toFixed(4)),
        y: Number(v.y.toFixed(4)),
        z: Number(v.z.toFixed(4))
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'taxel_map.json';
    a.click();
    URL.revokeObjectURL(url);
});

clearBtn.addEventListener('click', () => {
    if (confirm('Clear all taxel calibration points?')) {
        localStorage.removeItem('hiro_taxel_map');
        taxelLocalPositions = Array.from({ length: NUM_TAXELS }, () => new THREE.Vector3(999.0, 999.0, 999.0));
        currentCalibIndex = 0;
        updateMarkerPositions();
        statusDiv.textContent = 'Calibration cleared.';
    }
});

function loadSavedCalibration() {
    const saved = localStorage.getItem('hiro_taxel_map');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            parsed.forEach((pt) => {
                if (pt.id < NUM_TAXELS) {
                    taxelLocalPositions[pt.id].set(pt.x, pt.y, pt.z);
                }
            });
            updateMarkerPositions();
            console.log('Restored taxel map from localStorage');
        } catch (e) {
            console.error('Failed parsing localStorage taxel map:', e);
        }
    }
}

// Raycasting for Calibration Clicks
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

renderer.domElement.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !calibrationActive || !robot) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(robotMeshes, true);

    if (intersects.length === 0) return;

    const hit = intersects[0];

    // Convert world intersection to robot local coordinates
    const localHit = robot.worldToLocal(hit.point.clone());
    taxelLocalPositions[currentCalibIndex].copy(localHit);

    console.log(`Assigned S${currentCalibIndex} -> local:`, localHit);

    // Save progress to localStorage
    const toSave = taxelLocalPositions.map((v, i) => ({ id: i, x: v.x, y: v.y, z: v.z }));
    localStorage.setItem('hiro_taxel_map', JSON.stringify(toSave));

    updateMarkerPositions();

    currentCalibIndex++;
    if (currentCalibIndex >= NUM_TAXELS) {
        currentCalibIndex = 0;
        statusDiv.innerHTML = `<span style="color:#00ffcc;">All 24 Taxels Calibrated!</span>`;
    } else {
        statusDiv.innerHTML = `<span style="color:#ffaa00;">Click Hiro-chan for: <b>S${currentCalibIndex}</b></span>`;
    }
});

// -------------------------------------------------------------
// 7. ROS 2 Live Data Subscription
// -------------------------------------------------------------
tactileTopic.subscribe((msg) => {
    // Fill the live target buffer directly with all 24 channels
    for (let i = 0; i < NUM_TAXELS && i < msg.data.length; i++) {
        targetIntensities[i] = msg.data[i];
    }
});

// Window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// -------------------------------------------------------------
// 8. Animation & Damping Loop
// -------------------------------------------------------------
let lastTime = performance.now();

renderer.setAnimationLoop(() => {
    const now = performance.now();
    const delta = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    if (robot) {
        for (let i = 0; i < NUM_TAXELS; i++) {
            // Update live world position for each taxel
            if (taxelLocalPositions[i].x !== 999.0) {
                taxelWorldPositions[i]
                    .copy(taxelLocalPositions[i])
                    .applyMatrix4(robot.matrixWorld);
            }

            // Viscoelastic response dampening
            liveIntensities[i] = THREE.MathUtils.damp(
                liveIntensities[i],
                targetIntensities[i],
                8.0,
                delta
            );
        }
    }

    controls.update();
    renderer.render(scene, camera);
});