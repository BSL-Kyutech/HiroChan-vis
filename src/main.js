/* python3 ~/icepi_ros2_bridge.py /dev/ttyUSB0 */

/* ros2 launch rosbridge_server rosbridge_websocket_launch.xml *\





/* cd ~/threejs-project
npm run dev */

/* python3 ~/icepi_ros2_bridge.py /dev/ttyUSB0 */
/* ros2 launch rosbridge_server rosbridge_websocket_launch.xml */
/* cd ~/threejs-project && npm run dev */

/* python3 ~/icepi_ros2_bridge.py /dev/ttyUSB0 */

/* ros2 launch rosbridge_server rosbridge_websocket_launch.xml *\





/* cd ~/threejs-project
npm run dev */

/* python3 ~/icepi_ros2_bridge.py /dev/ttyUSB0 */

/* python3 ~/icepi_ros2_bridge.py /dev/ttyUSB0 */

/* ros2 launch rosbridge_server rosbridge_websocket_launch.xml */

/* cd ~/threejs-project
npm run dev */

import { TouchRegionEditor } from './touch-region-editor.js';
import { TactileCalibration } from './tactile-calibration.js';
import * as ROSLIB from 'roslib';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// -------------------------------------------------------------
// 1. ROS 2 Bridge Connection & HUD
// -------------------------------------------------------------
const host = window.location.hostname || 'localhost';
const statusBadge = document.getElementById('status-badge');
const pressureBar = document.getElementById('pressure-bar');

const ros = new ROSLIB.Ros();

function connectRos() {
    ros.connect(`ws://${host}:9090`);
}

ros.on('connection', () => {
    if (statusBadge) {
        statusBadge.textContent = 'Connected';
        statusBadge.className = 'hud-badge badge-connected';
    }
});

ros.on('error', () => {
    if (statusBadge) {
        statusBadge.textContent = 'Disconnected';
        statusBadge.className = 'hud-badge badge-disconnected';
    }
    setTimeout(connectRos, 2500);
});

ros.on('close', () => {
    if (statusBadge) {
        statusBadge.textContent = 'Disconnected';
        statusBadge.className = 'hud-badge badge-disconnected';
    }
});

connectRos();

// -------------------------------------------------------------
// Raspberry Pi tactile bridge controller (FastAPI on this PC)
// -------------------------------------------------------------
const HIRO_API = 'http://127.0.0.1:8000';

const bridgePanel = document.createElement('div');
bridgePanel.id = 'bridge-control-panel';
bridgePanel.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 10001;
    width: 220px;
    padding: 14px;
    background: rgba(18, 18, 18, 0.92);
    color: white;
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 10px;
    font: 13px system-ui, sans-serif;
    box-shadow: 0 4px 14px #0008;
`;

bridgePanel.innerHTML = `
    <div style="font-weight:700;color:#4fc3f7;margin-bottom:10px">
        Raspberry Pi Bridge
    </div>
    <div style="margin-bottom:10px">
        Service: <strong id="bridge-status">Checking...</strong>
    </div>
    <div style="display:flex;gap:8px">
        <button id="bridge-start" style="flex:1;padding:7px;background:#2e7d32;color:white;border:0;border-radius:4px;cursor:pointer">
            Start
        </button>
        <button id="bridge-stop" style="flex:1;padding:7px;background:#c62828;color:white;border:0;border-radius:4px;cursor:pointer">
            Stop
        </button>
    </div>
    <div id="bridge-message" style="margin-top:10px;color:#bbb;overflow-wrap:anywhere">
        Connecting to controller...
    </div>
`;

document.body.appendChild(bridgePanel);

const bridgeStatusText = bridgePanel.querySelector('#bridge-status');
const bridgeMessage = bridgePanel.querySelector('#bridge-message');
const bridgeStartButton = bridgePanel.querySelector('#bridge-start');
const bridgeStopButton = bridgePanel.querySelector('#bridge-stop');

async function refreshBridgeStatus() {
    try {
        const response = await fetch(`${HIRO_API}/api/bridge/status`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        bridgeStatusText.textContent = data.status;
        bridgeStatusText.style.color = data.running ? '#66bb6a' : '#ff8a80';
        bridgeMessage.textContent = 'Controller connected';
    } catch (error) {
        bridgeStatusText.textContent = 'Unknown';
        bridgeStatusText.style.color = '#ff8a80';
        bridgeMessage.textContent = `Controller unavailable: ${error.message}`;
    }
}

async function sendBridgeCommand(action) {
    bridgeStartButton.disabled = true;
    bridgeStopButton.disabled = true;
    bridgeMessage.textContent = `${action} command in progress...`;

    try {
        const response = await fetch(`${HIRO_API}/api/bridge/${action}`, {
            method: 'POST'
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.detail || `HTTP ${response.status}`);
        }

        bridgeMessage.textContent = data.message || `${action} command sent`;
        await refreshBridgeStatus();
    } catch (error) {
        bridgeMessage.textContent = `Command failed: ${error.message}`;
    } finally {
        bridgeStartButton.disabled = false;
        bridgeStopButton.disabled = false;
    }
}

bridgeStartButton.addEventListener('click', () => sendBridgeCommand('start'));
bridgeStopButton.addEventListener('click', () => sendBridgeCommand('stop'));

refreshBridgeStatus();
setInterval(refreshBridgeStatus, 3000);

const tactileTopic = new ROSLIB.Topic({
    ros: ros,
    name: '/tactile_sensors',
    messageType: 'std_msgs/msg/Float32MultiArray'
});

// -------------------------------------------------------------
// Rosbag Web Recording Controller
// -------------------------------------------------------------
const recBtn = document.getElementById('rec-btn');
let isRecording = false;

const recordService = new ROSLIB.Service({
    ros: ros,
    name: '/toggle_record',
    serviceType: 'std_srvs/srv/SetBool'
});

if (recBtn) {
    recBtn.addEventListener('click', () => {
        const nextState = !isRecording;
        recBtn.disabled = true;
        recBtn.textContent = '...';

        const timeout = setTimeout(() => {
            recBtn.disabled = false;
            recBtn.textContent = isRecording ? '■ Stop Recording' : '● Record Bag';
            console.warn('Timed out waiting for /toggle_record service response.');
        }, 4000);

        const request = {
            data: nextState
        };

        recordService.callService(request, (result) => {
            clearTimeout(timeout);
            recBtn.disabled = false;
            if (result && result.success) {
                isRecording = nextState;
                if (isRecording) {
                    recBtn.textContent = '■ Stop Recording';
                    recBtn.style.background = '#2b6cb0';
                } else {
                    recBtn.textContent = '● Record Bag';
                    recBtn.style.background = '#e53e3e';
                }
            } else {
                console.warn('Service returned failure:', result?.message);
                recBtn.textContent = isRecording ? '■ Stop Recording' : '● Record Bag';
            }
        }, (error) => {
            clearTimeout(timeout);
            recBtn.disabled = false;
            recBtn.textContent = isRecording ? '■ Stop Recording' : '● Record Bag';
            console.error('Failed to call /toggle_record service:', error);
        });
    });
}

// -------------------------------------------------------------
// 2. Scene Setup
// -------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);

const debugSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, depthTest: false })
);
debugSphere.renderOrder = 999;
scene.add(debugSphere);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 1000);
camera.position.set(0, 2, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
dirLight.position.set(2, 4, 3);
scene.add(dirLight);

const headlight = new THREE.DirectionalLight(0xffffff, 1.2);
headlight.position.set(0, 0, 1);
camera.add(headlight);
scene.add(camera);

const axesHelper = new THREE.AxesHelper(1);
const gridHelper = new THREE.GridHelper(3, 10);

window.hiroHelpers = [axesHelper, gridHelper];

let robot = null;
let modelCenterOffset = new THREE.Vector3(0, 0, 0);
const robotMeshes = [];
const activeShaders = [];

const touchState = {
    pos: new THREE.Vector3(0.0, 0.0, 0.0),
    intensity: 0.0,
    radius: 0.45,
    depth: 0.5
};
let targetIntensity = 0.0;

// -------------------------------------------------------------
// Manual tactile shader test controls
// -------------------------------------------------------------
const testPanel = document.createElement("div");

testPanel.style.cssText = `
  position: fixed;
  left: 12px;
  bottom: 12px;
  z-index: 10000;
  width: 260px;
  padding: 14px;
  background: #171a21;
  color: white;
  border-radius: 8px;
  font: 13px system-ui;
  box-shadow: 0 4px 18px #0008;
`;

testPanel.innerHTML = `
  <b>Manual Touch Test</b>
  <p>Intensity: <span id="test-intensity-value">0%</span></p>
  <input id="test-intensity" type="range"
    min="0" max="100" value="0" style="width:100%">

  <p>Deformation: <span id="test-depth-value">0.50</span></p>
  <input id="test-depth" type="range"
    min="0" max="100" value="50" style="width:100%">

  <p style="color:#bbb">
    Click a point on the robot to position the test touch.
  </p>
  <button id="test-release" style="margin-bottom:8px;">Release touch</button>
  <button id="test-json-btn" style="width:100%;padding:6px;background:#2b6cb0;color:white;border:none;border-radius:4px;cursor:pointer;">Test JSON Region 1</button>
`;

document.body.appendChild(testPanel);

const testIntensity = testPanel.querySelector("#test-intensity");
const testDepth = testPanel.querySelector("#test-depth");
const testIntensityValue = testPanel.querySelector("#test-intensity-value");
const testDepthValue = testPanel.querySelector("#test-depth-value");

let manualTestEnabled = false;

testIntensity.addEventListener("input", () => {
    manualTestEnabled = true;
    targetIntensity = Number(testIntensity.value) / 100;
    testIntensityValue.textContent = `${testIntensity.value}%`;
});

testDepth.addEventListener("input", () => {
    touchState.depth = Number(testDepth.value) / 100;
    testDepthValue.textContent = touchState.depth.toFixed(2);
});

testPanel.querySelector("#test-release").addEventListener("click", () => {
    manualTestEnabled = false;
    targetIntensity = 0;
    testIntensity.value = 0;
    testIntensityValue.textContent = "0%";
});

// -------------------------------------------------------------
// Calibration Data & Sensor-to-Region Mapping
// -------------------------------------------------------------
let hiroTouchRegions = [];
let tactileCalibration = null;

let tactileCalibrationConfig = {
    schemaVersion: 1,
    createdAt: "2026-11-18T16:22:07.841Z",
    channelCount: 24,
    mappingRule: "one_sensor_to_one_region",
    sensors: [
        { sensor: 1, region: "", category: "unassigned", behavior: "normal", baseline: 0.0015468749741557985, noise: 0.000781093724074043, min: 0, max: 0.003020833246409893, touchThreshold: 0.000781093724074043, status: "captured" },
        { sensor: 2, region: "", category: "unassigned", behavior: "normal", baseline: 0, noise: 0, min: 0, max: 0, touchThreshold: 0, status: "captured" },
        { sensor: 3, region: "", category: "unassigned", behavior: "normal", baseline: 0, noise: 0, min: 0, max: 0, touchThreshold: 0, status: "captured" },
        { sensor: 4, region: "head 2", category: "head", behavior: "normal", baseline: 0.0005437500029802322, noise: 0.001982102000525583, min: 0, max: 0.07500000298023224, touchThreshold: 0.0111684379465878, status: "captured" },
        { sensor: 5, region: "foot 20", category: "feet", behavior: "normal", baseline: 0.0007531250081956386, noise: 0.00046511438503460563, min: 0, max: 0.06145833432674408, touchThreshold: 0.009105781397782266, status: "captured" },
        { sensor: 6, region: "", category: "unassigned", behavior: "normal", baseline: 0, noise: 0, min: 0, max: 0, touchThreshold: 0, status: "captured" },
        { sensor: 7, region: "", category: "unassigned", behavior: "normal", baseline: 0.003824999884236604, noise: 0.0030513571846079333, min: 0, max: 0.058020833879709244, touchThreshold: 0.008129375099320896, status: "captured" },
        { sensor: 8, region: "head 3", category: "head", behavior: "normal", baseline: 0.0023604167439043523, noise: 0.002724002044362469, min: 0, max: 0.054479166865348816, touchThreshold: 0.00781781251821667, status: "captured" },
        { sensor: 9, region: "", category: "unassigned", behavior: "normal", baseline: 0.001311458331765607, noise: 0.0007831359034119892, min: 0, max: 0.08229167014360428, touchThreshold: 0.0121470317717758, status: "captured" },
        { sensor: 10, region: "upper body 7", category: "front_body", behavior: "normal", baseline: 0.0020541666820645334, noise: 0.0033180012161616672, min: 0, max: 0.0793749988079071, touchThreshold: 0.011598124818876385, status: "captured" },
        { sensor: 11, region: "right front leg 15", category: "left_leg", behavior: "normal", baseline: 0.0012854166934266687, noise: 0.0026559117976071183, min: 0, max: 0.08124999701976776, touchThreshold: 0.011994687048951163, status: "captured" },
        { sensor: 12, region: "front body 10", category: "front_body", behavior: "normal", baseline: 0.0005541666597127915, noise: 0.0013734903156193492, min: 0, max: 0.06541666388511658, touchThreshold: 0.009729374583810567, status: "captured" },
        { sensor: 13, region: "head 1", category: "head", behavior: "normal", baseline: 0.0018031249986961485, noise: 0.0006915435183362552, min: 0, max: 0.05885416641831398, touchThreshold: 0.008557656212942674, status: "captured" },
        { sensor: 14, region: "right front leg 17", category: "right_leg", behavior: "normal", baseline: 0.0009364583203569054, noise: 0.0024258756953892606, min: 0, max: 0.052916668355464935, touchThreshold: 0.007797031505266203, status: "captured" },
        { sensor: 15, region: "foot 19", category: "feet", behavior: "normal", baseline: 0.0005020833481103182, noise: 0.0018309869515037954, min: 0, max: 0.0741666629910469, touchThreshold: 0.011049686946440488, status: "captured" },
        { sensor: 16, region: "", category: "unassigned", behavior: "normal", baseline: 0.0014458333305083215, noise: 0.0015517183508059736, min: 0, max: 0.058020833879709244, touchThreshold: 0.008486250082380138, status: "captured" },
        { sensor: 17, region: "", category: "unassigned", behavior: "normal", baseline: 0, noise: 0, min: 0, max: 0, touchThreshold: 0, status: "captured" },
        { sensor: 18, region: "left front leg 16", category: "left_leg", behavior: "normal", baseline: 0, noise: 0, min: 0, max: 0.058541666716337204, touchThreshold: 0.008781250007450581, status: "captured" },
        { sensor: 19, region: "head 4", category: "head", behavior: "normal", baseline: 0.0004354166754637845, noise: 0.0008456614185132424, min: 0, max: 0.058541666716337204, touchThreshold: 0.008715937506131012, status: "captured" },
        { sensor: 20, region: "", category: "unassigned", behavior: "normal", baseline: 0, noise: 0, min: 0, max: 0, touchThreshold: 0, status: "captured" },
        { sensor: 21, region: "chest 5", category: "front_body", behavior: "normal", baseline: 0.00016041666269302367, noise: 0.0011229166388511647, min: 0, max: 0.05770833417773247, touchThreshold: 0.008632187627255917, status: "captured" },
        { sensor: 22, region: "", category: "unassigned", behavior: "normal", baseline: 0, noise: 0, min: 0, max: 0, touchThreshold: 0, status: "captured" },
        { sensor: 23, region: "", category: "unassigned", behavior: "normal", baseline: 0.00023645833134651185, noise: 0.0013452313253120363, min: 0, max: 0.05156249925494194, touchThreshold: 0.007698906138539314, status: "captured" },
        { sensor: 24, region: "front body 9", category: "front_body", behavior: "normal", baseline: 0, noise: 0, min: 0, max: 0.0833333358168602, touchThreshold: 0.01250000037252903, status: "captured" }
    ]
};

async function loadTactileCalibrationConfig() {
    try {
        const response = await fetch('/data/hiro-tactile-calibration.json');
        if (response.ok) {
            tactileCalibrationConfig = await response.json();
            console.log(
                `Loaded tactile calibration config (Schema v${tactileCalibrationConfig.schemaVersion})`,
                `Created at: ${tactileCalibrationConfig.createdAt}`,
                `Total channels: ${tactileCalibrationConfig.channelCount}`
            );
        }
    } catch (error) {
        console.warn('Using embedded calibration config fallback:', error);
    }
    return tactileCalibrationConfig;
}

async function loadHiroTouchRegions() {
    try {
        const response = await fetch('/data/hiro-touch-regions.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data.version !== 2 || !Array.isArray(data.regions)) {
            throw new Error('Unexpected JSON format');
        }

        hiroTouchRegions = data.regions.filter(
            region =>
                typeof region.name === 'string' &&
                Array.isArray(region.points) &&
                region.points.length >= 3 &&
                region.points.every(
                    point =>
                        Array.isArray(point.position) &&
                        point.position.length === 3
                )
        );

        console.log(
            `Loaded ${hiroTouchRegions.length} Hiro-chan touch regions`,
            hiroTouchRegions.map(region => region.name)
        );

        return hiroTouchRegions;
    } catch (error) {
        console.error('Failed to load Hiro-chan touch regions:', error);
        return [];
    }
}

function getSensorCalibration(sensorIndex) {
    const sensorNumber = sensorIndex + 1;
    return tactileCalibrationConfig?.sensors?.find(s => s.sensor === sensorNumber) || null;
}

function getRegionForSensor(sensorIndex) {
    const calib = getSensorCalibration(sensorIndex);
    if (!calib || !calib.region || calib.category === 'unassigned') {
        return null;
    }

    const targetName = calib.region.trim().toLowerCase();
    return hiroTouchRegions.find(
        (region) => region.name.trim().toLowerCase() === targetName
    ) || null;
}

function getRegionCenter(region) {
    if (!region || !Array.isArray(region.points) || region.points.length === 0) {
        return null;
    }

    const center = new THREE.Vector3();
    for (const point of region.points) {
        center.add(
            new THREE.Vector3(
                point.position[0],
                point.position[1],
                point.position[2]
            )
        );
    }
    return center.divideScalar(region.points.length);
}

// Snaps coordinates to outer mesh surface
const surfaceRaycaster = new THREE.Raycaster();
function getSurfacePoint(rawTargetPos) {
    if (!robotMeshes.length) return rawTargetPos;

    // Raycast towards origin from slightly outside the bounding sphere
    const rayOrigin = rawTargetPos.clone().normalize().multiplyScalar(3.0);
    const rayDir = new THREE.Vector3().subVectors(rawTargetPos, rayOrigin).normalize();

    surfaceRaycaster.set(rayOrigin, rayDir);
    const hits = surfaceRaycaster.intersectObjects(robotMeshes, true);

    if (hits.length > 0) {
        return hits[0].point;
    }
    return rawTargetPos;
}

// -------------------------------------------------------------
// 3. Deformable Shader Setup (Physical Deformation Commented Out)
// -------------------------------------------------------------
function setupDeformableMaterial(mat) {
    mat.roughness = 0.2;
    mat.metalness = 0.02;

    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTouchPos = { value: touchState.pos };
        shader.uniforms.uIntensity = { value: 0.0 };
        shader.uniforms.uRadius = { value: touchState.radius };
        shader.uniforms.uDepth = { value: touchState.depth };

        activeShaders.push(shader);

        shader.vertexShader = `
            uniform vec3 uTouchPos;
            uniform float uIntensity;
            uniform float uRadius;
            uniform float uDepth;
            varying float vFactor;
        ` + shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            vec4 worldP = modelMatrix * vec4(position, 1.0);
            vFactor = 0.0;

            if (uIntensity > 0.02) {
                float d = distance(worldP.xyz, uTouchPos);
                if (d < uRadius) {
                    float r = d / uRadius;
                    float indent = 0.5 * (1.0 + cos(r * 3.14159265));
                    float disp = indent * uIntensity;

                    // Commented out so the mesh does not deform physically:
                    // transformed -= normal * (disp * uDepth);
                    vFactor = disp;
                }
            }
            `
        );

        shader.fragmentShader = `
            varying float vFactor;

            vec3 getTactileColor(float t) {
                vec3 c0 = vec3(0.05, 0.20, 0.90);
                vec3 c1 = vec3(0.00, 0.85, 0.95);
                vec3 c2 = vec3(1.00, 0.85, 0.05);
                vec3 c3 = vec3(0.95, 0.05, 0.05);

                if (t < 0.33) return mix(c0, c1, t / 0.33);
                else if (t < 0.66) return mix(c1, c2, (t - 0.33) / 0.33);
                else return mix(c2, c3, (t - 0.66) / 0.34);
            }
        ` + shader.fragmentShader;

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            `
            #include <dithering_fragment>
            if (vFactor > 0.02) {
                float p = clamp(vFactor * 2.0, 0.0, 1.0);
                vec3 heat = getTactileColor(p);
                gl_FragColor.rgb = mix(gl_FragColor.rgb, heat, clamp(p * 2.0, 0.0, 0.95));
            }
            `
        );
    };

    mat.needsUpdate = true;
}

// -------------------------------------------------------------
// 4. Model Loading & Topic Setup
// -------------------------------------------------------------
const loader = new GLTFLoader();

loader.load(
    '/models/hiro-chan.glb',
    async (gltf) => {
        robot = gltf.scene;

        await loadHiroTouchRegions();
        await loadTactileCalibrationConfig();

        robot.traverse((child) => {
            if (child.isMesh && child.geometry) {
                child.geometry.deleteAttribute('normal');
                child.geometry = BufferGeometryUtils.mergeVertices(child.geometry, 0.0015);
                child.geometry.computeVertexNormals();

                robotMeshes.push(child);
                child.material = child.material.clone();
                child.material.flatShading = false;
                child.material.side = THREE.DoubleSide;
                setupDeformableMaterial(child.material);
            }
        });

        const box = new THREE.Box3().setFromObject(robot);
        modelCenterOffset = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        robot.position.sub(modelCenterOffset);
        scene.add(robot);
        robot.updateMatrixWorld(true);

        const testBtn = document.getElementById("test-json-btn");
        if (testBtn) {
            testBtn.onclick = () => {
                const region = hiroTouchRegions.find(r => r.name === "head 1");
                if (!region) return;

                const center = getRegionCenter(region);
                const worldPos = center.clone().sub(modelCenterOffset);
                const surfacePos = getSurfacePoint(worldPos);

                touchState.pos.copy(surfacePos);
                touchState.intensity = 0.9;
                targetIntensity = 0.9;
                console.log("Applied Head 1 Touch at surface:", surfacePos.toArray());
            };
        }

        // Calibration panel consumes the same verified WebSocket stream.
        tactileCalibration = new TactileCalibration({
            regions: hiroTouchRegions.map(region => region.name)
        });

        // Setup the real tactile WebSocket subscription. Dummy simulation is disabled.
        setupRosTactileSubscription();

        const maxDim = Math.max(size.x, size.y, size.z);
        camera.position.set(0, maxDim * 0.35, maxDim * 1.6);
        controls.target.set(0, 0, 0);
        controls.update();
    }
);

// -------------------------------------------------------------
// 5. Hardware / Rosbag Touch Routing (Using Calibrated Sensors)
// -------------------------------------------------------------
let lastProcessTime = 0;
const THROTTLE_MS = 16;
let highSince = 0;
const MIN_TOUCH_DURATION_MS = 40;

function setupRosTactileSubscription() {
    const wsUrl = 'ws://127.0.0.1:8765';
    let reconnectTimer = null;

    function connectTactileSocket() {
        const socket = new WebSocket(wsUrl);

        socket.addEventListener('open', () => {
            console.log('[Tactile WS] Connected');
            if (statusBadge) {
                statusBadge.textContent = 'Tactile Connected';
                statusBadge.className = 'hud-badge badge-connected';
            }
        });

        socket.addEventListener('message', (event) => {
            if (manualTestEnabled) return;

            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch (error) {
                console.error('[Tactile WS] Invalid JSON:', error);
                return;
            }

            const now = performance.now();
            if (now - lastProcessTime < THROTTLE_MS) return;
            lastProcessTime = now;

            if (!Array.isArray(msg.data) || msg.data.length === 0) return;
            tactileCalibration?.update(msg.data);

            let bestIndex = -1;
            let bestNormalized = 0.0;

            for (let i = 0; i < msg.data.length; i++) {
                const rawValue = Number(msg.data[i]);
                if (!Number.isFinite(rawValue)) continue;

                const calib = getSensorCalibration(i);
                // Ignore unassigned channels or channels without a mapped region
                if (!calib || !calib.region || calib.category === 'unassigned') continue;

                const baseline = Number(calib.baseline) || 0;
                const threshold = Number(calib.touchThreshold) || 0.008;
                const maxVal = Number(calib.max) || 0.06;

                // Signal above baseline
                const signal = Math.max(0, rawValue - baseline);

                if (signal >= threshold) {
                    const effectiveRange = Math.max(maxVal - baseline - threshold, 1e-5);
                    const normalized = Math.min(
                        Math.max((signal - threshold) / effectiveRange, 0.15),
                        1.0
                    );

                    if (normalized > bestNormalized) {
                        bestNormalized = normalized;
                        bestIndex = i;
                    }
                }
            }

            if (bestIndex !== -1) {
                if (highSince === 0) highSince = now;
            } else {
                highSince = 0;
            }

            if (highSince === 0 || now - highSince < MIN_TOUCH_DURATION_MS) {
                targetIntensity = 0.0;
                if (pressureBar) pressureBar.style.width = '0%';
                return;
            }

            applyTouchToSensorIndex(bestIndex, bestNormalized);

            if (pressureBar) {
                pressureBar.style.width = `${Math.round(bestNormalized * 100)}%`;
            }
        });

        socket.addEventListener('close', () => {
            console.warn('[Tactile WS] Disconnected');
            if (statusBadge) {
                statusBadge.textContent = 'Tactile Disconnected';
                statusBadge.className = 'hud-badge badge-disconnected';
            }
            clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(connectTactileSocket, 2500);
        });

        socket.addEventListener('error', (error) => {
            console.error('[Tactile WS] Connection error:', error);
            socket.close();
        });
    }

    connectTactileSocket();
}

function applyTouchToSensorIndex(sensorIndex, intensity) {
    const region = getRegionForSensor(sensorIndex);
    if (!region) return;

    const center = getRegionCenter(region);
    if (!center) return;

    // Shift by model center and snap to outward skin surface
    const worldPos = center.clone().sub(modelCenterOffset);
    const surfacePos = getSurfacePoint(worldPos);

    touchState.pos.copy(surfacePos);
    targetIntensity = intensity;
}

// -------------------------------------------------------------
// 6. Dummy Sensor Data Simulator
// -------------------------------------------------------------
function startDummySensorStream() {
    let activeChannel = 0;
    const NUM_CHANNELS = 24;

    setInterval(() => {
        if (manualTestEnabled) return;

        const activeRegion = getRegionForSensor(activeChannel);
        if (activeRegion) {
            console.log(`[Simulator] Activating Channel ${activeChannel} (${activeRegion.name})`);
            applyTouchToSensorIndex(activeChannel, 0.85);

            if (pressureBar) {
                pressureBar.style.width = '85%';
            }
        }

        activeChannel = (activeChannel + 1) % NUM_CHANNELS;
    }, 1200);
}

// -------------------------------------------------------------
// 7. Raycasting & Interaction
// -------------------------------------------------------------
renderer.domElement.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(robotMeshes, true);

    if (hits.length > 0) {
        manualTestEnabled = true;
        touchState.pos.copy(hits[0].point);
        targetIntensity = 0.8;
        testIntensity.value = 80;
        testIntensityValue.textContent = "80%";
    }
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// -------------------------------------------------------------
// 8. Animation Loop
// -------------------------------------------------------------
let lastTime = performance.now();

renderer.setAnimationLoop(() => {
    const now = performance.now();
    const delta = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    touchState.intensity = THREE.MathUtils.damp(
        touchState.intensity,
        targetIntensity,
        15.0,
        delta
    );

    if (touchState.intensity < 0.01) {
        touchState.intensity = 0.0;
    }

    // Move debug red sphere with the active touch
    if (debugSphere) {
        debugSphere.position.copy(touchState.pos);
        debugSphere.visible = touchState.intensity > 0.02;
    }

    // Direct uniform updates
    for (let i = 0; i < activeShaders.length; i++) {
        const u = activeShaders[i].uniforms;
        if (u && u.uIntensity) {
            u.uIntensity.value = touchState.intensity;
            u.uTouchPos.value.copy(touchState.pos);
            u.uRadius.value = touchState.radius;
            u.uDepth.value = touchState.depth;
        }
    }

    controls.update();
    renderer.render(scene, camera);
});