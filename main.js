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

// --- Parameters and GUI ---
const params = {
    squareSize: 128,
    color1: '#444444',
    color2: '#888888',
    rotationSpeed: 1,
    throwForce: 1,
    rollResult: 'N/A',
    roll: () => rollDice(),
};

const gui = new lil.GUI();

// --- Ground ---
function createCheckerboardTexture(squareSize, color1, color2) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    const divisions = canvas.width / squareSize;
    for (let x = 0; x < divisions; x++) {
        for (let y = 0; y < divisions; y++) {
            context.fillStyle = (x + y) % 2 === 0 ? color1 : color2;
            context.fillRect(x * squareSize, y * squareSize, squareSize, squareSize);
        }
    }
    return new THREE.CanvasTexture(canvas);
}

let groundTexture = createCheckerboardTexture(params.squareSize, params.color1, params.color2);
groundTexture.wrapS = THREE.RepeatWrapping;
groundTexture.wrapT = THREE.RepeatWrapping;
groundTexture.repeat.set(25, 25);

const groundMaterial = new CANNON.Material('groundMaterial');
const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ map: groundTexture, metalness: 0.2, roughness: 0.5 })
);
groundMesh.rotation.x = -Math.PI / 2;
scene.add(groundMesh);

const groundBody = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Plane(),
    material: groundMaterial
});
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// --- Walls ---
const wallMaterial = new CANNON.Material('wallMaterial');
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
createWall(new CANNON.Vec3(0, 0, -5), new CANNON.Quaternion().setFromEuler(0, 0, 0));
createWall(new CANNON.Vec3(0, 0, 5), new CANNON.Quaternion().setFromEuler(0, Math.PI, 0));
createWall(new CANNON.Vec3(-5, 0, 0), new CANNON.Quaternion().setFromEuler(0, Math.PI / 2, 0));
createWall(new CANNON.Vec3(5, 0, 0), new CANNON.Quaternion().setFromEuler(0, -Math.PI / 2, 0));

// --- Dice ---
const dieMaterial = new CANNON.Material('dieMaterial');
const dieBody = new CANNON.Body({
    mass: 1,
    shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)),
    material: dieMaterial,
    angularDamping: 0.8
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

const dieMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    [1, 6, 2, 5, 3, 4].map(num => new THREE.MeshStandardMaterial({ map: createDiceTexture(num) }))
);
scene.add(dieMesh);

// --- Contact Materials ---
const groundDieContactMaterial = new CANNON.ContactMaterial(groundMaterial, dieMaterial, { friction: 0.5, restitution: 0.2 });
world.addContactMaterial(groundDieContactMaterial);
const dieWallContactMaterial = new CANNON.ContactMaterial(dieMaterial, wallMaterial, { friction: 0.01, restitution: 0.5 });
world.addContactMaterial(dieWallContactMaterial);

// --- UI ---
const messageEl = document.createElement('div');
messageEl.id = 'message';
messageEl.innerText = 'Tap to roll';
document.body.appendChild(messageEl);

const groundFolder = gui.addFolder('Ground');
groundFolder.add(params, 'squareSize', 8, 256, 1).name('Square Size').onChange(updateGroundTexture);
groundFolder.addColor(params, 'color1').name('Color 1').onChange(updateGroundTexture);
groundFolder.addColor(params, 'color2').name('Color 2').onChange(updateGroundTexture);

const diceFolder = gui.addFolder('Dice');
diceFolder.add(params, 'rotationSpeed', 0.01, 5, 0.01).name('Rotation Speed');
diceFolder.add(params, 'throwForce', 0.1, 10, 0.1).name('Throw Force');

const resultFolder = gui.addFolder('Result');
resultFolder.add(params, 'rollResult').name('Last Roll').listen();
resultFolder.add(params, 'roll').name('Roll Again');

function updateGroundTexture() {
    groundTexture.dispose(); // Dispose old texture
    groundTexture = createCheckerboardTexture(params.squareSize, params.color1, params.color2);
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(25, 25);
    groundMesh.material.map = groundTexture;
    groundMesh.material.needsUpdate = true;
}

// --- Game Logic ---
let isRolling = false;

function rollDice() {
    if (isRolling) return;
    isRolling = true;
    messageEl.innerText = 'Rolling...';

    dieBody.position.set(0, 2, 0);
    dieBody.quaternion.setFromEuler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);

    const force = new CANNON.Vec3(
        (Math.random() * 2 - 1) * params.throwForce,
        params.throwForce,
        (Math.random() * 2 - 1) * params.throwForce
    );
    const torque = new CANNON.Vec3(
        (Math.random() - 0.5) * 5 * params.rotationSpeed,
        (Math.random() - 0.5) * 5 * params.rotationSpeed,
        (Math.random() - 0.5) * 5 * params.rotationSpeed
    );
    dieBody.applyImpulse(force, dieBody.position);
    dieBody.applyTorque(torque);
}

window.addEventListener('click', rollDice);

function getDiceFace() {
    const up = new THREE.Vector3(0, 1, 0);
    let closestFace = 0;
    let maxDot = -1;

    const faceNormals = [
        { value: 1, normal: new THREE.Vector3(0, 0, 1) },
        { value: 6, normal: new THREE.Vector3(0, 0, -1) },
        { value: 2, normal: new THREE.Vector3(0, 1, 0) },
        { value: 5, normal: new THREE.Vector3(0, -1, 0) },
        { value: 3, normal: new THREE.Vector3(1, 0, 0) },
        { value: 4, normal: new THREE.Vector3(-1, 0, 0) },
    ];

    for (const face of faceNormals) {
        const worldNormal = face.normal.clone().applyQuaternion(dieMesh.quaternion);
        const dot = worldNormal.dot(up);
        if (dot > maxDot) {
            maxDot = dot;
            closestFace = face.value;
        }
    }
    return closestFace;
}

function animate() {
    requestAnimationFrame(animate);

    world.step(1 / 60);

    dieMesh.position.copy(dieBody.position);
    dieMesh.quaternion.copy(dieBody.quaternion);

    const targetPosition = dieMesh.position.clone().add(new THREE.Vector3(0, 5, 5));
    camera.position.lerp(targetPosition, 0.05);
    camera.lookAt(dieMesh.position);

    if (isRolling) {
        const sleepSpeed = 0.1;
        if (dieBody.velocity.length() < sleepSpeed && dieBody.angularVelocity.length() < sleepSpeed) {
            isRolling = false;
            const result = getDiceFace();
            params.rollResult = result;
            messageEl.innerText = 'Tap to roll again';
        }
    }

    renderer.render(scene, camera);
}

rollDice(); // Initial roll
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});