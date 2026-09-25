import { loadBundledOSMRoadNetwork, loadOSMRoadNetwork, loadBundledOSMBuildingNetwork, loadOSMBuildingNetwork } from './osm.js';
import { createCityrunner, createPedestrian, createTree, createStreetlight } from './models.js';
import * as THREE from 'three';

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x9db1bf);
scene.fog=new THREE.Fog(0x9db1bf,90,360);

const camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.1,1200);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
document.querySelector('#game-root').appendChild(renderer.domElement);

const gameClock=new THREE.Clock();
const keys=new Set();
const worldUp=new THREE.Vector3(0,1,0);
const blockSpan=64;

let started=false,inCar=false,cameraMode='third';
let timeOfDay=8;
let playerYaw=0;

// Third-person camera state.
// Pointer Lock provides continuous touchpad/mouse deltas for look input.
// The target angles are smoothed into the rendered camera so the response
// feels weighty without losing direct control.
let cameraYaw=0;
let cameraPitch=-0.18;
let cameraYawTarget=0;
let cameraPitchTarget=-0.18;
let cameraDistanceTarget=6.35;
let cameraDistance=6.35;
let cameraZoomOffset=0;
let cameraYawVelocity=0;
let cameraPitchVelocity=0;
let lastCameraInput=0;
let pointerLocked=false;
let aiming=false;
let cameraFollowPivot=new THREE.Vector3();
let cameraRaycaster=new THREE.Raycaster();
const cameraCollisionMeshes=[];
const cameraLookSensitivity=.0026;
const cameraPitchSensitivity=.0022;
const cameraShoulderOffset=.68;
const locomotionClock=new THREE.Clock();
let locomotionTime=0;
let playerVelocity=new THREE.Vector3();
let playerMoveInput=new THREE.Vector3();
let playerMoveSpeed=0;
let carSpeed=0,carHeading=Math.PI*.5;
let toastTimer=0;
let mapReady=false;
let mapSegments=[];
let mapBounds={minX:-450,maxX:450,minZ:-450,maxZ:450};

const ui={
  start:document.querySelector('#start-screen'),
  startButton:document.querySelector('#start-button'),
  cameraMode:document.querySelector('#camera-mode'),
  clock:document.querySelector('#clock'),
  vehicleHud:document.querySelector('#vehicle-hud'),
  speed:document.querySelector('#speed'),
  notice:document.querySelector('#notice'),
  toast:document.querySelector('#toast')
};

function toast(msg){
  ui.toast.textContent=msg;
  ui.toast.classList.remove('hidden');
  toastTimer=1.8;
}

const hemi=new THREE.HemisphereLight(0xddefff,0x4a4339,2.2);
scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff0c9,3.4);
sun.position.set(70,110,40);
sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-150;sun.shadow.camera.right=150;sun.shadow.camera.top=150;sun.shadow.camera.bottom=-150;
scene.add(sun);

function material(color,roughness=.85,metalness=0){
  return new THREE.MeshStandardMaterial({color,roughness,metalness});
}
function box(w,h,d,color,x,y,z,opts={}){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color,opts.roughness??.85,opts.metalness??0));
  m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;
}

box(12000,1,12000,0x6b756f,0,-.5,0);

function createFallbackGrid(){
  const blockSpan=64,roadWidth=12;
  const roadMat=material(0x2d3035,.97),lineMat=material(0xd3b65a,.8);
  for(let i=-4;i<=4;i++){
    box(roadWidth,.08,520,roadMat,i*blockSpan,.03,0);
    for(let z=-240;z<=240;z+=12) box(.16,.03,4,lineMat,i*blockSpan,.1,z);
    box(520,.08,roadWidth,roadMat,0,.03,i*blockSpan);
    for(let x=-240;x<=240;x+=12) box(4,.03,.16,lineMat,x,.1,i*blockSpan);
  }
}

async function loadRealMap(){
  ui.startButton.disabled=false;
  ui.startButton.textContent='LOADING MAP…';
  try{
    const road=await loadBundledOSMRoadNetwork();
    scene.add(road.group);
    mapSegments=road.segments;
    mapBounds=road.bounds;
    try{
      const buildings=await loadBundledOSMBuildingNetwork();
      scene.add(buildings.group);
      registerCameraCollisionGroup(buildings.group);
    }catch(buildingBundleError){
      console.warn('Bundled building data unavailable; loading live OSM buildings:',buildingBundleError);
      try{
        const buildings=await loadOSMBuildingNetwork();
        scene.add(buildings.group);
        registerCameraCollisionGroup(buildings.group);
      }catch(buildingError){
        console.warn('Live OSM building data unavailable:',buildingError);
      }
    }
    for(let i=0;i<Math.min(70,mapSegments.length);i+=4){
      const s=mapSegments[i];
      if(!['primary','secondary','tertiary'].includes(s.highway))continue;
      const lamp=createStreetlight();
      lamp.position.set(s.midpoint.x,.1,s.midpoint.z);
      lamp.rotation.y=s.heading;
      scene.add(lamp);
    }
    mapReady=true;

    const nearest=road.segments
      .slice()
      .sort((a,b)=>a.midpoint.lengthSq()-b.midpoint.lengthSq())[0];

    if(nearest && !started){
      car.position.set(nearest.midpoint.x,.66,nearest.midpoint.z);
      carHeading=nearest.heading;
      car.rotation.y=carHeading;
      player.position.set(nearest.midpoint.x-2.8,0,nearest.midpoint.z+1.5);
      playerYaw=carHeading;
      player.rotation.y=playerYaw;
      cameraYaw=carHeading;
    }

    ui.startButton.disabled=false;
    if(!started) ui.startButton.textContent='ENTER THE CITY';
    document.querySelector('.start-note').textContent='Real OpenStreetMap road network loaded · Keyboard + mouse recommended';
  }catch(bundledError){
    console.warn('Bundled OpenStreetMap map failed:',bundledError);
    try{
      const road=await loadOSMRoadNetwork();
      scene.add(road.group);
      mapSegments=road.segments;
      mapBounds=road.bounds;
      mapReady=true;

      const nearest=road.segments.slice().sort((a,b)=>a.midpoint.lengthSq()-b.midpoint.lengthSq())[0];
      if(nearest && !started){
        car.position.set(nearest.midpoint.x,.66,nearest.midpoint.z);
        carHeading=nearest.heading;
        car.rotation.y=carHeading;
        player.position.set(nearest.midpoint.x-2.8,0,nearest.midpoint.z+1.5);
        playerYaw=carHeading;
        player.rotation.y=playerYaw;
      }
      ui.startButton.disabled=false;
      if(!started) ui.startButton.textContent='ENTER THE CITY';
      document.querySelector('.start-note').textContent='Live OpenStreetMap road network loaded · Keyboard + mouse recommended';
    }catch(error){
      console.warn('OpenStreetMap load failed, using fallback map:',error);
      createFallbackGrid();
      mapReady=true;
      ui.startButton.disabled=false;
      if(!started) ui.startButton.textContent='ENTER THE CITY';
      document.querySelector('.start-note').textContent='Map service unavailable · fallback city loaded';
    }
  }
}

const player=createPedestrian(1);
player.position.set(-8,0,8);
scene.add(player);

const car=createCityrunner();
car.position.set(5,.66,11);
car.rotation.y=carHeading;
scene.add(car);

const npcs=[];
for(let i=0;i<22;i++){
  const n=createPedestrian(i+2);
  n.position.set(
    (Math.floor(Math.random()*8)-4)*blockSpan+(Math.random()-.5)*8,
    0,
    (Math.floor(Math.random()*8)-4)*blockSpan+(Math.random()-.5)*8
  );
  n.scale.setScalar(.86+Math.random()*.1);
  scene.add(n);
  npcs.push({mesh:n,angle:Math.random()*Math.PI*2,speed:.45+Math.random()*.6});
}

const traffic=[];
for(let i=0;i<14;i++){
  const t=new THREE.Mesh(new THREE.BoxGeometry(1.5,.55,2.8),material([0xd58d59,0x809ab2,0x9e9e9e,0x456d65][i%4],.7,.1));
  t.castShadow=true;scene.add(t);
  traffic.push({mesh:t,speed:5+Math.random()*7,segment:null,t:Math.random(),direction:Math.random()>.5?1:-1,axis:'x'});
}

const keysDown=code=>keys.has(code);

function nearCar(){return player.position.distanceTo(car.position)<5.2;}

function toggleCamera(){
  cameraMode=cameraMode==='third'?'first':'third';
  ui.cameraMode.textContent=cameraMode.toUpperCase();
  toast(cameraMode==='third'?'Third-person camera':'First-person camera');
}

function enterExit(){
  if(inCar){
    inCar=false;player.visible=true;
    player.position.set(car.position.x+2.4,0,car.position.z);
    ui.vehicleHud.classList.add('hidden');ui.notice.classList.add('hidden');toast('Back on foot');return;
  }
  if(nearCar()){
    inCar=true;player.visible=false;ui.vehicleHud.classList.remove('hidden');ui.notice.classList.add('hidden');toast('Cityrunner acquired');
  }else toast('Walk closer to the Cityrunner');
}

function updatePlayer(dt){
  if(inCar){
    playerVelocity.set(0,0,0);
    playerMoveSpeed=0;
    return;
  }

  // Camera-relative movement, with acceleration/deceleration so the character
  // feels like a controllable third-person action-game avatar instead of a
  // position being teleported by the keys.
  const forward=new THREE.Vector3(
    Math.sin(cameraYaw),0,-Math.cos(cameraYaw)
  );
  const right=new THREE.Vector3(
    Math.cos(cameraYaw),0,Math.sin(cameraYaw)
  );

  playerMoveInput.set(0,0,0);
  if(keysDown('KeyW'))playerMoveInput.add(forward);
  if(keysDown('KeyS'))playerMoveInput.sub(forward);
  if(keysDown('KeyD'))playerMoveInput.add(right);
  if(keysDown('KeyA'))playerMoveInput.sub(right);

  const hasInput=playerMoveInput.lengthSq()>0;
  if(hasInput)playerMoveInput.normalize();

  const sprinting=keysDown('ShiftLeft')||keysDown('ShiftRight');
  const targetSpeed=sprinting?9.6:5.8;
  const acceleration=hasInput?(sprinting?25:22):18;
  const braking=hasInput?10:24;

  const targetVelocity=playerMoveInput.clone().multiplyScalar(
    hasInput?targetSpeed:0
  );

  const response=hasInput?acceleration:braking;
  const blend=1-Math.exp(-response*dt);
  playerVelocity.lerp(targetVelocity,blend);

  const maxSpeed=targetSpeed*1.05;
  const horizontalSpeed=Math.hypot(playerVelocity.x,playerVelocity.z);
  if(horizontalSpeed>maxSpeed){
    playerVelocity.multiplyScalar(maxSpeed/horizontalSpeed);
  }

  player.position.addScaledVector(playerVelocity,dt);

  // Smoothly face the direction of actual travel. This means strafing still
  // feels natural, while forward movement turns the character into its path.
  const travelSpeed=Math.hypot(playerVelocity.x,playerVelocity.z);
  if(travelSpeed>.12){
    const desiredHeading=Math.atan2(playerVelocity.x,-playerVelocity.z);
    const delta=shortestAngleDelta(playerYaw,desiredHeading);
    const turnRate=sprinting?11.5:10.0;
    playerYaw+=delta*(1-Math.exp(-turnRate*dt));
    player.rotation.y=playerYaw;
    playerMoveSpeed=travelSpeed;
  }else{
    playerMoveSpeed=0;
  }

  player.position.x=THREE.MathUtils.clamp(
    player.position.x,mapBounds.minX+2,mapBounds.maxX-2
  );
  player.position.z=THREE.MathUtils.clamp(
    player.position.z,mapBounds.minZ+2,mapBounds.maxZ-2
  );
}function animatePlayerLocomotion(dt){
  const torso=player.getObjectByName('torso');
  const head=player.getObjectByName('head');
  const armL=player.getObjectByName('armL');
  const armR=player.getObjectByName('armR');
  const legL=player.getObjectByName('legL');
  const legR=player.getObjectByName('legR');

  const speed=playerMoveSpeed;
  const normalized=THREE.MathUtils.clamp(speed/9.6,0,1);
  if(speed>.12){
    const strideRate=5.5+normalized*3.2;
    locomotionTime+=dt*strideRate;
    const swing=Math.sin(locomotionTime)*(.3+.28*normalized);
    const opposite=-swing;

    if(legL)legL.rotation.x=swing;
    if(legR)legR.rotation.x=opposite;
    if(armL)armL.rotation.x=opposite*.72;
    if(armR)armR.rotation.x=swing*.72;

    if(torso){
      torso.position.y=1.28+Math.abs(Math.sin(locomotionTime*2))*(.018+.026*normalized);
      torso.rotation.z=Math.sin(locomotionTime)*.018*normalized;
    }
    if(head){
      head.position.y=2.02+Math.abs(Math.sin(locomotionTime*2))*.012;
    }
  }else{
    locomotionTime*=Math.exp(-8*dt);
    const settle=1-Math.exp(-10*dt);
    if(legL)legL.rotation.x=THREE.MathUtils.lerp(legL.rotation.x,0,settle);
    if(legR)legR.rotation.x=THREE.MathUtils.lerp(legR.rotation.x,0,settle);
    if(armL)armL.rotation.x=THREE.MathUtils.lerp(armL.rotation.x,0,settle);
    if(armR)armR.rotation.x=THREE.MathUtils.lerp(armR.rotation.x,0,settle);
    if(torso){
      torso.position.y=THREE.MathUtils.lerp(torso.position.y,1.28,settle);
      torso.rotation.z=THREE.MathUtils.lerp(torso.rotation.z,0,settle);
    }
    if(head)head.position.y=THREE.MathUtils.lerp(head.position.y,2.02,settle);
  }
}

function updateCar(dt){
  if(!inCar){carSpeed*=Math.pow(.25,dt);return;}

  const throttle=keysDown('KeyW')?1:keysDown('KeyS')?-1:0;
  if(throttle>0)carSpeed+=20*dt;
  else if(throttle<0)carSpeed-=13*dt;
  else carSpeed*=Math.pow(.12,dt);

  if(keysDown('Space'))carSpeed*=Math.pow(.003,dt);
  carSpeed=THREE.MathUtils.clamp(carSpeed,-11,28);

  const steer=(keysDown('KeyD')?1:0)-(keysDown('KeyA')?1:0);
  const steerStrength=Math.min(Math.abs(carSpeed)/16,1)*1.9;
  carHeading-=steer*steerStrength*dt*Math.sign(carSpeed||1);
  car.rotation.y=carHeading;

  const forward=new THREE.Vector3(0,0,-1).applyAxisAngle(worldUp,carHeading);
  car.position.addScaledVector(forward,carSpeed*dt);
  car.position.x=THREE.MathUtils.clamp(car.position.x,mapBounds.minX+2,mapBounds.maxX-2);
  car.position.z=THREE.MathUtils.clamp(car.position.z,mapBounds.minZ+2,mapBounds.maxZ-2);

  // High-speed driving gently brings the orbit back behind the car when the player isn't looking around.
  ui.speed.textContent=Math.round(Math.abs(carSpeed)*3.6);
}
function updateNPCs(dt){
  for(const n of npcs){
    n.angle+=(Math.random()-.5)*dt*.25;
    const dir=new THREE.Vector3(Math.cos(n.angle),0,Math.sin(n.angle));
    n.mesh.position.addScaledVector(dir,n.speed*dt);n.mesh.rotation.y=n.angle;
    if(Math.abs(n.mesh.position.x)>245||Math.abs(n.mesh.position.z)>245)n.angle+=Math.PI;
  }
}

function updateTraffic(dt){
  for(const t of traffic){
    if(mapSegments.length){
      if(!t.segment||t.t>1||t.t<0){
        t.segment=mapSegments[Math.floor(Math.random()*mapSegments.length)];
        t.t=Math.random();
        t.direction=Math.random()>.5?1:-1;
      }
      const s=t.segment;
      t.t+=dt*t.speed/Math.max(s.length,1)*t.direction;
      const p=s.a.clone().lerp(s.b,THREE.MathUtils.clamp(t.t,0,1));
      t.mesh.position.set(p.x,.38,p.z);
      t.mesh.rotation.y=s.heading+(t.direction<0?Math.PI:0);
    }
  }
}

function shortestAngleDelta(from,to){
  return THREE.MathUtils.euclideanModulo(to-from+Math.PI,Math.PI*2)-Math.PI;
}

function registerCameraCollisionGroup(group){
  if(!group)return;
  group.traverse(o=>{
    if(o.isMesh)cameraCollisionMeshes.push(o);
  });
}

function requestGamePointerLock(){
  if(!started||pointerLocked)return;
  if(!renderer.domElement.requestPointerLock)return;
  try{
    const result=renderer.domElement.requestPointerLock({unadjustedMovement:true});
    if(result&&typeof result.catch==='function'){
      result.catch(()=>{
        try{renderer.domElement.requestPointerLock();}catch{}
      });
    }
  }catch{
    try{renderer.domElement.requestPointerLock();}catch{}
  }
}

function cameraObstructionDistance(target,desired){
  const offset=desired.clone().sub(target);
  const distance=offset.length();
  if(distance<=.05)return distance;

  const direction=offset.clone().normalize();
  cameraRaycaster.set(target,direction);

  const hits=cameraRaycaster.intersectObjects(
    cameraCollisionMeshes.length?cameraCollisionMeshes:scene.children,
    true
  );

  const blocked=hits.find(hit=>{
    let o=hit.object;
    while(o){
      if(o===player||o===car||o.userData.ignoreCamera)return false;
      o=o.parent;
    }
    return true;
  });

  if(!blocked||blocked.distance>=distance)return distance;

  // Pull the camera in front of the wall/obstacle and let the normal
  // follow interpolation do the visual smoothing.
  return Math.max(1.05,blocked.distance-.22);
}

function updateCamera(dt){
  const followTarget=inCar
    ? car.position.clone().add(new THREE.Vector3(0,1.02,0))
    : player.position.clone().add(new THREE.Vector3(0,1.12,0));

  // The character is always the authoritative target.
  cameraFollowPivot.lerp(
    followTarget,
    1-Math.exp(-(inCar?15:13)*dt)
  );

  const moving=inCar
    ? Math.abs(carSpeed)>2.5
    : playerMoveSpeed>.25;

  const now=performance.now()/1000;
  const sinceLook=now-lastCameraInput;

  // Auto-centre only when the user has stopped looking around.
  if(!pointerLocked&&!aiming){
    // No manual look input: the camera may settle behind movement.
  }

  if(!aiming&&moving&&sinceLook>.72){
    const movementHeading=inCar
      ? carHeading
      : Math.atan2(playerVelocity.x,-playerVelocity.z);

    const delta=shortestAngleDelta(cameraYawTarget,movementHeading);
    const recenterRate=inCar?3.7:3.1;
    cameraYawTarget+=delta*(1-Math.exp(-recenterRate*dt));
  }

  // Smooth the pointer-lock target into the actual rendered orbit.
  const yawDelta=shortestAngleDelta(cameraYaw,cameraYawTarget);
  cameraYaw+=yawDelta*(1-Math.exp(-18*dt));
  cameraPitch+=(
    cameraPitchTarget-cameraPitch
  )*(1-Math.exp(-18*dt));

  // Tiny post-release inertia.
  if(!pointerLocked){
    cameraYawTarget+=cameraYawVelocity*dt;
    cameraPitchTarget+=cameraPitchVelocity*dt;
    cameraYawVelocity*=Math.exp(-8.5*dt);
    cameraPitchVelocity*=Math.exp(-9*dt);
  }

  cameraPitch=THREE.MathUtils.clamp(cameraPitch,-0.78,.95);
  cameraPitchTarget=THREE.MathUtils.clamp(cameraPitchTarget,-0.78,.95);

  if(cameraMode==='first'){
    const lookDirection=new THREE.Vector3(
      Math.sin(cameraYaw)*Math.cos(cameraPitch),
      Math.sin(cameraPitch),
      -Math.cos(cameraYaw)*Math.cos(cameraPitch)
    ).normalize();

    const firstPersonPosition=followTarget.clone().add(
      new THREE.Vector3(0,inCar?1.0:.82,0)
    );

    camera.position.lerp(
      firstPersonPosition,
      1-Math.exp(-20*dt)
    );
    camera.lookAt(
      firstPersonPosition.clone().addScaledVector(lookDirection,20)
    );
    camera.fov=aiming?57:68;
    camera.updateProjectionMatrix();
    return;
  }

  const speed01=THREE.MathUtils.clamp(Math.abs(carSpeed)/28,0,1);
  const baseDistance=inCar?8.2:6.35;
  const normalSpeedExtension=inCar?2.2*speed01:0;
  const aimDistance=inCar?5.9:4.65;
  const desiredDistance=aiming
    ? aimDistance
    : baseDistance+normalSpeedExtension+cameraZoomOffset;

  const minDistance=inCar?4.8:3.35;
  const maxDistance=inCar?12.5:9.5;

  cameraDistanceTarget=THREE.MathUtils.clamp(
    desiredDistance,
    minDistance,
    maxDistance
  );
  cameraDistance+=(
    cameraDistanceTarget-cameraDistance
  )*(1-Math.exp(-8.5*dt));

  const horizontal=Math.cos(cameraPitch);
  const orbitDirection=new THREE.Vector3(
    Math.sin(cameraYaw)*horizontal,
    Math.sin(cameraPitch),
    -Math.cos(cameraYaw)*horizontal
  ).normalize();

  const cameraRight=new THREE.Vector3(
    Math.cos(cameraYaw),
    0,
    Math.sin(cameraYaw)
  );

  const shoulderAmount=aiming
    ? (inCar?.96:.88)
    : (inCar?.82:cameraShoulderOffset);

  const shoulderOffset=cameraRight.multiplyScalar(shoulderAmount);

  const desiredCameraPosition=
    cameraFollowPivot.clone()
      .add(shoulderOffset)
      .addScaledVector(orbitDirection,-cameraDistance);

  const collisionTarget=cameraFollowPivot.clone().add(
    new THREE.Vector3(0,.1,0)
  );

  const allowedDistance=cameraObstructionDistance(
    collisionTarget,
    desiredCameraPosition
  );

  const collisionPosition=
    cameraFollowPivot.clone()
      .add(shoulderOffset)
      .addScaledVector(orbitDirection,-allowedDistance);

  collisionPosition.y=Math.max(
    collisionPosition.y,
    cameraFollowPivot.y+.72
  );

  camera.position.lerp(
    collisionPosition,
    1-Math.exp(-11*dt)
  );

  // Keep the player as the focus, with a restrained aim bias.
  const lookTarget=cameraFollowPivot.clone().add(
    new THREE.Vector3(0,aiming?.26:.12,0)
  );

  camera.lookAt(lookTarget);

  const normalFov=68+(inCar?10.5*speed01:0);
  const targetFov=aiming?55:normalFov;
  camera.fov+=(
    targetFov-camera.fov
  )*(1-Math.exp(-8*dt));
  camera.updateProjectionMatrix();
}

function updateWorldClock(dt){
  timeOfDay+=dt*.065;if(timeOfDay>=24)timeOfDay-=24;
  const hrs=Math.floor(timeOfDay),mins=Math.floor((timeOfDay-hrs)*60);
  ui.clock.textContent=String(hrs).padStart(2,'0')+':'+String(mins).padStart(2,'0');
  const daylight=Math.max(.18,Math.sin(((timeOfDay-6)/24)*Math.PI*2)*.5+.5);
  sun.intensity=.7+daylight*3;hemi.intensity=.55+daylight*1.8;
}

function interactionHint(){
  if(inCar){ui.notice.classList.add('hidden');return;}
  if(nearCar()){ui.notice.textContent='Press E to enter Cityrunner S1';ui.notice.classList.remove('hidden');}
  else ui.notice.classList.add('hidden');
}

addEventListener('keydown',e=>{
  keys.add(e.code);
  if(e.code==='KeyV')toggleCamera();
  if(e.code==='KeyE')enterExit();
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
});
addEventListener('keyup',e=>keys.delete(e.code));


document.addEventListener('contextmenu',e=>{
  if(started)e.preventDefault();
});

document.addEventListener('pointerlockchange',()=>{
  pointerLocked=document.pointerLockElement===renderer.domElement;
  if(pointerLocked){
    lastCameraInput=performance.now()/1000;
    renderer.domElement.classList.add('pointer-locked');
  }else{
    renderer.domElement.classList.remove('pointer-locked');
    aiming=false;
  }
});

document.addEventListener('pointerlockerror',()=>{
  pointerLocked=false;
  renderer.domElement.classList.remove('pointer-locked');
});

document.addEventListener('mousemove',e=>{
  if(!started||!pointerLocked)return;

  const dx=Number.isFinite(e.movementX)?e.movementX:0;
  const dy=Number.isFinite(e.movementY)?e.movementY:0;

  // Direct continuous look:
  // touchpad/finger right -> look right
  // touchpad/finger left  -> look left
  cameraYawTarget+=dx*cameraLookSensitivity;
  cameraPitchTarget=THREE.MathUtils.clamp(
    cameraPitchTarget-dy*cameraPitchSensitivity,
    -0.78,.95
  );

  // Track the last input so auto-recentering knows the user is looking.
  lastCameraInput=performance.now()/1000;

  // Small release momentum.
  cameraYawVelocity=THREE.MathUtils.clamp(dx*.00045,-.18,.18);
  cameraPitchVelocity=THREE.MathUtils.clamp(-dy*.00035,-.12,.12);
});

renderer.domElement.addEventListener('mousedown',e=>{
  if(!started)return;

  // Left click requests Pointer Lock. Once locked, the cursor no longer
  // constrains the camera at the edge of the screen.
  if(e.button===0){
    requestGamePointerLock();
    return;
  }

  // Right click = smooth GTA-style aim/zoom state.
  if(e.button===2){
    aiming=true;
    lastCameraInput=performance.now()/1000;
    e.preventDefault();
  }
});

renderer.domElement.addEventListener('mouseup',e=>{
  if(e.button===2){
    aiming=false;
    lastCameraInput=performance.now()/1000;
  }
});

renderer.domElement.addEventListener('mouseleave',()=>{
  if(!pointerLocked)aiming=false;
});

ui.startButton.addEventListener('click',()=>{
  started=true;
  ui.start.classList.add('hidden');
  cameraFollowPivot.copy(
    player.position.clone().add(new THREE.Vector3(0,1.12,0))
  );
  cameraYawTarget=playerYaw;
  cameraYaw=playerYaw;
  cameraPitchTarget=-0.18;
  lastCameraInput=performance.now()/1000;

  requestGamePointerLock();
  toast('Move the trackpad to look · Right click to aim');
});

renderer.domElement.addEventListener('click',()=>{
  if(started&&!pointerLocked)requestGamePointerLock();
});

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);
});

function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(gameClock.getDelta(),.04);
  if(started){
    updatePlayer(dt);animatePlayerLocomotion(dt);updateCar(dt);updateNPCs(dt);updateTraffic(dt);updateCamera(dt);updateWorldClock(dt);interactionHint();
    if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)ui.toast.classList.add('hidden');}
  }else{camera.position.set(56,50,56);camera.lookAt(0,0,0);}
  renderer.render(scene,camera);
}
loadRealMap();
animate();
