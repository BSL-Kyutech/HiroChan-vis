/* cd ~/threejs-project
npm run dev */

import * as ROSLIB from 'roslib';
import * as THREE from 'three';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const ros = new ROSLIB.Ros({
    url: 'ws://localhost:9090'
});

ros.on('connection', () => {
    console.log('Connected to rosbridge');
});

ros.on('error', (err) => {
    console.log('ROS error:', err);
});

ros.on('close', () => {
    console.log('ROS connection closed');
});

const tactileTopic = new ROSLIB.Topic({
    ros: ros,
    name: '/tactile_sensors',
    messageType: 'tactile_interfaces/msg/TactileSensor'
});

const sensorDots = {};

tactileTopic.subscribe((msg) => {

    console.log(
        'Sensor triggered:',
        msg.sensor_id,
        'Intensity:',
        msg.intensity
    );

    const dot = sensorDots[msg.sensor_id];

    if (!dot) {
        console.log(
            'No visual sensor found for sensor:',
            msg.sensor_id
        );
        return;
    }

    const intensity = Math.max(
        0,
        Math.min(
            1,
            Number(msg.intensity)
        )
    );

    dot.material.color.setHex(0xff0000);
    dot.material.opacity = 0.3 + intensity * 0.7;

    const scale = 1 + intensity;

    dot.scale.set(
        scale,
        scale,
        scale
    );

    setTimeout(() => {

        dot.material.color.setHex(0x00ffcc);
        dot.material.opacity = 0.3;

        dot.scale.set(
            1,
            1,
            1
        );

    }, 400);

});

const scene = new THREE.Scene();

scene.background =
    new THREE.Color(0x222222);

const camera =
    new THREE.PerspectiveCamera(
        60,
        window.innerWidth /
        window.innerHeight,
        0.01,
        1000
    );

camera.position.set(
    0,
    2,
    4
);

const renderer =
    new THREE.WebGLRenderer({
        antialias: true
    });

renderer.setSize(
    window.innerWidth,
    window.innerHeight
);

renderer.setPixelRatio(
    Math.min(
        window.devicePixelRatio,
        2
    )
);

renderer.outputColorSpace =
    THREE.SRGBColorSpace;

document.body.appendChild(
    renderer.domElement
);

const controls =
    new OrbitControls(
        camera,
        renderer.domElement
    );

controls.enableDamping = true;

scene.add(
    new THREE.AmbientLight(
        0xffffff,
        1.0
    )
);

const headlight =
    new THREE.DirectionalLight(
        0xffffff,
        2.0
    );

headlight.position.set(
    0,
    0,
    1
);

camera.add(headlight);

scene.add(camera);

scene.add(
    new THREE.AxesHelper(1)
);

scene.add(
    new THREE.GridHelper(
        3,
        10
    )
);

const raycaster =
    new THREE.Raycaster();

const mouse =
    new THREE.Vector2();

let highlightedMesh = null;
let originalMaterial = null;

const hitMarkerGeometry =
    new THREE.SphereGeometry(
        0.025,
        16,
        16
    );

const hitMarkerMaterial =
    new THREE.MeshBasicMaterial({
        color: 0xffff00
    });

const hitMarker =
    new THREE.Mesh(
        hitMarkerGeometry,
        hitMarkerMaterial
    );

hitMarker.visible = false;

scene.add(hitMarker);

let robot = null;

const loader =
    new GLTFLoader();

const sphereGeo =
    new THREE.SphereGeometry(
        0.03,
        16,
        16
    );

loader.load(
    '/models/hiro-chan.glb',

    (gltf) => {

        console.log(
            'Hiro-chan loaded'
        );

        robot =
            gltf.scene;

        robot.traverse((object) => {

            if (object.isMesh) {

                console.log(
                    'Mesh:',
                    object.name
                );

            }

        });

        const box =
            new THREE.Box3()
                .setFromObject(robot);

        const center =
            box.getCenter(
                new THREE.Vector3()
            );

        const size =
            box.getSize(
                new THREE.Vector3()
            );

        console.log(
            'Model size:',
            size
        );

        robot.position.sub(
            center
        );

        scene.add(robot);

        const points = {

            sensor_1:
                new THREE.Vector3(
                    -0.4611667607,
                    -0.0413638029,
                    0.2851935671
                ),

            sensor_2:
                new THREE.Vector3(
                    0.4522433187,
                    -0.0035454870,
                    0.3065316321
                ),

            sensor_3:
                new THREE.Vector3(
                    -0.0223373905,
                    -0.1629513477,
                    0.2018051583
                )

        };

        Object.keys(points).forEach(
            (id) => {

                const material =
                    new THREE.MeshBasicMaterial({

                        color: 0x00ffcc,

                        transparent: true,

                        opacity: 0.3

                    });

                const dot =
                    new THREE.Mesh(
                        sphereGeo,
                        material
                    );

                dot.position.copy(
                    points[id]
                );

                robot.add(dot);

                const sensorId =
                    Number(
                        id.split('_')[1]
                    );

                sensorDots[
                    sensorId
                ] = dot;

                console.log(
                    `Sensor ${sensorId} position:`,
                    points[id]
                );

            }
        );

        const maxDim =
            Math.max(
                size.x,
                size.y,
                size.z
            );

        camera.position.set(
            0,
            maxDim * 0.3,
            maxDim * 1.6
        );

        controls.target.set(
            0,
            0,
            0
        );

        controls.update();

    },

    (progress) => {

        if (progress.total > 0) {

            console.log(
                `Loading: ${
                    Math.round(
                        (
                            progress.loaded /
                            progress.total
                        ) * 100
                    )
                }%`
            );

        }

    },

    (error) => {

        console.log(
            'Hiro-chan loading error:',
            error
        );

    }
);

function performRaycast(
    clientX,
    clientY
) {

    if (!robot) {

        console.log(
            'Robot is not loaded yet.'
        );

        return;

    }

    mouse.x =
        (
            clientX /
            window.innerWidth
        ) * 2 - 1;

    mouse.y =
        -(
            clientY /
            window.innerHeight
        ) * 2 + 1;

    raycaster.setFromCamera(
        mouse,
        camera
    );

    const intersects =
        raycaster.intersectObject(
            robot,
            true
        );

    if (
        intersects.length === 0
    ) {

        console.log(
            'Ray did not hit Hiro-chan.'
        );

        hitMarker.visible =
            false;

        return;

    }

    const hit =
        intersects[0];

    console.log(
        '================================'
    );

    console.log(
        'RAYCAST HIT'
    );

    console.log(
        'Mesh:',
        hit.object.name
    );

    console.log(
        'Distance:',
        hit.distance
    );

    console.log(
        'World position:',
        hit.point
    );

    console.log(
        'Face index:',
        hit.faceIndex
    );

    console.log(
        'Face:',
        hit.face
    );

    console.log(
        '================================'
    );

    hitMarker.position.copy(
        hit.point
    );

    hitMarker.visible =
        true;

    highlightMesh(
        hit.object
    );

}

function highlightMesh(
    mesh
) {

    if (
        highlightedMesh &&
        originalMaterial
    ) {

        highlightedMesh.material =
            originalMaterial;

    }

    if (!mesh.isMesh) {

        return;

    }

    highlightedMesh =
        mesh;

    originalMaterial =
        mesh.material;

    mesh.material =
        mesh.material.clone();

    if (
        'emissive' in
        mesh.material
    ) {

        mesh.material.emissive =
            new THREE.Color(
                0xff0000
            );

        mesh.material.emissiveIntensity =
            2.0;

    }

}

window.addEventListener(
    'click',
    (event) => {

        performRaycast(
            event.clientX,
            event.clientY
        );

    }
);

window.addEventListener(
    'resize',
    () => {

        camera.aspect =
            window.innerWidth /
            window.innerHeight;

        camera.updateProjectionMatrix();

        renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );

    }
);

renderer.setAnimationLoop(
    () => {

        controls.update();

        renderer.render(
            scene,
            camera
        );

    }
);