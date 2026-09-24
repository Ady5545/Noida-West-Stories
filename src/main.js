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
let cameraYaw=0;
let cameraPitch=-0.18;
let cameraDistanceTarget=6.8;
let cameraDistance=6.8;
let cameraYawVelocity=0;
let lastCameraInput=0;
let cameraRaycaster=new THREE.Raycaster();
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
    }catch(buildingBundleError){
      console.warn('Bundled building data unavailable; loading live OSM buildings:',buildingBundleError);
      try{
        const buildings=await loadOSMBuildingNetwork();
        scene.add(buildings.group);
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
  if(inCar)return;

  const forward=new THREE.Vector3(Math.sin(cameraYaw),0,-Math.cos(cameraYaw));
  const right=new THREE.Vector3(Math.cos(cameraYaw),0,Math.sin(cameraYaw));
  const move=new THREE.Vector3();

  if(keysDown('KeyW'))move.add(forward);
  if(keysDown('KeyS'))move.sub(forward);
  if(keysDown('KeyD'))move.add(right);
  if(keysDown('KeyA'))move.sub(right);

  if(move.lengthSq()>0){
    move.normalize();
    const speed=(keysDown('ShiftLeft')||keysDown('ShiftRight'))?10:5.7;
    player.position.addScaledVector(move,speed*dt);

    // Character turns toward travel direction; camera remains independently orbitable.
    const desiredHeading=Math.atan2(move.x,-move.z);
    const delta=THREE.MathUtils.euclideanModulo(desiredHeading-playerYaw+Math.PI,Math.PI*2)-Math.PI;
    playerYaw+=delta*Math.min(1,dt*10);
    player.rotation.y=playerYaw;
  }

  player.position.x=THREE.MathUtils.clamp(player.position.x,mapBounds.minX+2,mapBounds.maxX-2);
  player.position.z=THREE.MathUtils.clamp(player.position.z,mapBounds.minZ+2,mapBounds.maxZ-2);
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

function cameraObstructionDistance(target,desired){
  const direction=desired.clone().sub(target);
  const distance=direction.length();
  direction.normalize();

  cameraRaycaster.set(target,direction);
  const blocked=cameraRaycaster.intersectObjects(scene.children,true).find(hit=>{
    let o=hit.object;
    while(o){
      if(o===player||o===car||o.userData.ignoreCamera)return false;
      o=o.parent;
    }
    return true;
  });

  if(!blocked||blocked.distance>=distance) return distance;
  return Math.max(1.25,blocked.distance-.25);
}

function updateCamera(dt){
  const target=inCar
    ? car.position.clone().add(new THREE.Vector3(0,1.0,0))
    : player.position.clone().add(new THREE.Vector3(0,1.15,0));

  // GTA-style springy follow/orbit: mouse changes the orbit, movement/driving softly recenters it.
  const moving=inCar ? Math.abs(carSpeed)>3 : (keysDown('KeyW')||keysDown('KeyS')||keysDown('KeyA')||keysDown('KeyD'));
  const now=performance.now()/1000;
  const sinceLook=now-lastCameraInput;

  if(moving && sinceLook>.55){
    const recenterHeading=inCar?carHeading:playerYaw;
    const delta=THREE.MathUtils.euclideanModulo(recenterHeading-cameraYaw+Math.PI,Math.PI*2)-Math.PI;
    const recenterRate=inCar?2.6:2.15;
    cameraYaw+=delta*(1-Math.exp(-recenterRate*dt));
  }

  if(cameraMode==='first'){
    const heading=cameraYaw;
    const forward=new THREE.Vector3(Math.sin(heading),Math.sin(cameraPitch),-Math.cos(heading)).normalize();
    const pos=target.clone().add(new THREE.Vector3(0,inCar?1.0:.9,0));
    camera.position.lerp(pos,1-Math.exp(-18*dt));
    camera.lookAt(pos.clone().addScaledVector(forward,20));
    camera.fov=68;
    camera.updateProjectionMatrix();
    return;
  }

  const speed01=THREE.MathUtils.clamp(Math.abs(carSpeed)/28,0,1);
  const baseDistance=inCar?8.8:6.8;
  cameraDistanceTarget=baseDistance+(inCar?1.6*speed01:0);
  cameraDistance+= (cameraDistanceTarget-cameraDistance)*(1-Math.exp(-5.5*dt));

  const horiz=Math.cos(cameraPitch);
  const desiredDirection=new THREE.Vector3(
    Math.sin(cameraYaw)*horiz,
    Math.sin(cameraPitch),
    -Math.cos(cameraYaw)*horiz
  ).normalize();

  const desired=target.clone().addScaledVector(desiredDirection,-cameraDistance);
  desired.y+=inCar?2.35:2.55;

  const allowedDistance=cameraObstructionDistance(target,desired);
  const collisionDesired=target.clone().addScaledVector(desiredDirection,-allowedDistance);
  collisionDesired.y=Math.max(target.y+.8,collisionDesired.y);

  camera.position.lerp(collisionDesired,1-Math.exp(-8*dt));
  camera.lookAt(target);

  const targetFov=68+(inCar?10*speed01:0);
  camera.fov+= (targetFov-camera.fov)*(1-Math.exp(-4*dt));
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


document.addEventListener('mousemove',e=>{
  if(!started||document.pointerLockElement!==renderer.domElement)return;
  const sensitivity=.0026;
  cameraYaw-=e.movementX*sensitivity;
  cameraPitch=THREE.MathUtils.clamp(cameraPitch-e.movementY*sensitivity,-0.72,.38);
  lastCameraInput=performance.now()/1000;
});

ui.startButton.addEventListener('click',()=>{
  started=true;ui.start.classList.add('hidden');
  renderer.domElement.requestPointerLock?.();
  toast('Welcome to Noida West Stories');
});
renderer.domElement.addEventListener('click',()=>{if(started)renderer.domElement.requestPointerLock?.()});

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);
});

function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(gameClock.getDelta(),.04);
  if(started){
    updatePlayer(dt);updateCar(dt);updateNPCs(dt);updateTraffic(dt);updateCamera();updateWorldClock(dt);interactionHint();
    if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)ui.toast.classList.add('hidden');}
  }else{camera.position.set(56,50,56);camera.lookAt(0,0,0);}
  renderer.render(scene,camera);
}
loadRealMap();
animate();
