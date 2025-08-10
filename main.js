const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(2, 5, 5);
scene.add(directionalLight);

// Physics
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);

// Materials
const groundMaterial = new CANNON.Material('groundMaterial');
const dieMaterial = new CANNON.Material('dieMaterial');
const wallMaterial = new CANNON.Material('wallMaterial');

// Contact Materials
const groundDieContactMaterial = new CANNON.ContactMaterial(groundMaterial, dieMaterial, {
    friction: 0.1,
    restitution: 0.5
});
world.addContactMaterial(groundDieContactMaterial);

const dieWallContactMaterial = new CANNON.ContactMaterial(dieMaterial, wallMaterial, {
    friction: 0.01,
    restitution: 0.8
});
world.addContactMaterial(dieWallContactMaterial);

// Ground
const groundBody = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Plane(),
    material: groundMaterial
});
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.2, roughness: 0.5 })
);
groundMesh.rotation.x = -Math.PI / 2;
scene.add(groundMesh);

// Walls
function createWall(position, quaternion) {
    const wallBody = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Plane(),
        material: wallMaterial,
        position: position,
        quaternion: quaternion
    });
    world.addBody(wallBody);
}
createWall(new CANNON.Vec3(0, 0, -5), new CANNON.Quaternion().setFromEuler(0, 0, 0)); // Back
createWall(new CANNON.Vec3(0, 0, 5), new CANNON.Quaternion().setFromEuler(0, Math.PI, 0)); // Front
createWall(new CANNON.Vec3(-5, 0, 0), new CANNON.Quaternion().setFromEuler(0, Math.PI / 2, 0)); // Left
createWall(new CANNON.Vec3(5, 0, 0), new CANNON.Quaternion().setFromEuler(0, -Math.PI / 2, 0)); // Right

// Dice
const dieBody = new CANNON.Body({
    mass: 1,
    shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)),
    material: dieMaterial
});
world.addBody(dieBody);

function createDiceTexture(num) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 128;
    canvas.height = 128;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = 'black';
    ctx.font = 'bold 90px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(num, 64, 64);
    return new THREE.CanvasTexture(canvas);
}

const textures = [
    createDiceTexture(1),
    createDiceTexture(6),
    createDiceTexture(2),
    createDiceTexture(5),
    createDiceTexture(3),
    createDiceTexture(4),
];

const dieMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    textures.map(t => new THREE.MeshStandardMaterial({ map: t }))
);
scene.add(dieMesh);

// UI Elements
const messageEl = document.getElementById('message');
const resultEl = document.getElementById('result');
const historyListEl = document.getElementById('history-list');

let isRolling = false;

function rollDice() {
    if (isRolling) return;
    isRolling = true;
    messageEl.innerText = 'Rolling...';
    resultEl.innerText = '';

    dieBody.position.set(0, 2, 0);
    dieBody.quaternion.setFromEuler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);

    const force = new CANNON.Vec3(Math.random() * 20 - 10, 5, Math.random() * 20 - 10);
    const torque = new CANNON.Vec3(Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10);
    dieBody.applyImpulse(force, dieBody.position);
    dieBody.applyTorque(torque);
}

window.addEventListener('click', rollDice);

function getDiceFace() {
    const up = new THREE.Vector3(0, 1, 0);
    let closestFace;
    let maxDot = -1;

    const faces = [
        { value: 1, normal: new THREE.Vector3(0, 0, 1) },
        { value: 6, normal: new THREE.Vector3(0, 0, -1) },
        { value: 2, normal: new THREE.Vector3(0, 1, 0) },
        { value: 5, normal: new THREE.Vector3(0, -1, 0) },
        { value: 3, normal: new THREE.Vector3(1, 0, 0) },
        { value: 4, normal: new THREE.Vector3(-1, 0, 0) },
    ];

    faces.forEach(face => {
        const worldNormal = face.normal.clone().applyQuaternion(dieMesh.quaternion);
        const dot = worldNormal.dot(up);
        if (dot > maxDot) {
            maxDot = dot;
            closestFace = face.value;
        }
    });
    return closestFace;
}

function animate() {
    requestAnimationFrame(animate);

    world.step(1 / 60);

    dieMesh.position.copy(dieBody.position);
    dieMesh.quaternion.copy(dieBody.quaternion);

    // Camera follow
    const targetPosition = dieMesh.position.clone().add(new THREE.Vector3(0, 5, 5));
    camera.position.lerp(targetPosition, 0.05);
    camera.lookAt(dieMesh.position);

    if (isRolling) {
        const sleepSpeed = 0.1;
        if (dieBody.velocity.length() < sleepSpeed && dieBody.angularVelocity.length() < sleepSpeed) {
            isRolling = false;
            const result = getDiceFace();
            resultEl.innerText = result;
            messageEl.innerText = 'Tap to roll again';
            
            const li = document.createElement('li');
            li.innerText = `You rolled a ${result}`;
            historyListEl.prepend(li);
        }
    }

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
