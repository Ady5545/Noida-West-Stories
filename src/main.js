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

let started=false,inCar=false,cameraMode='third';
let timeOfDay=8;
let playerYaw=0,playerPitch=-0.08;
let carSpeed=0,carHeading=Math.PI*.5;
let toastTimer=0;

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
function tree(x,z){
  box(.7,4,.7,0x6b513f,x,2,z);
  const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(2.5,1),material(0x3f714a,1,0));
  crown.position.set(x,4.8,z);crown.castShadow=true;scene.add(crown);
}

box(520,1,520,0x6b756f,0,-.5,0);

const blockSpan=64,roadWidth=12;
const roadMat=material(0x2d3035,.97);
const lineMat=material(0xd3b65a,.8);
for(let i=-4;i<=4;i++){
  box(roadWidth,.08,520,roadMat,i*blockSpan,.03,0);
  for(let z=-240;z<=240;z+=12) box(.16,.03,4,lineMat,i*blockSpan,.1,z);
  box(520,.08,roadWidth,roadMat,0,.03,i*blockSpan);
  for(let x=-240;x<=240;x+=12) box(4,.03,.16,lineMat,x,.1,i*blockSpan);
}

const palettes=[0xb8aa96,0xd0c0aa,0x8ea2ad,0xc79e7b,0x9d9aa3,0xb4bda9];
for(let bx=-4;bx<4;bx++) for(let bz=-4;bz<4;bz++){
  if((bx===0&&bz===0)||Math.random()<.14) continue;
  const cx=bx*blockSpan+20+Math.random()*10,cz=bz*blockSpan+20+Math.random()*10;
  const w=24+Math.random()*9,d=23+Math.random()*9,floors=3+Math.floor(Math.random()*8),h=floors*3.6;
  box(w,h,d,palettes[(bx+bz+20)%palettes.length],cx,h/2,cz,{roughness:.96});
  const winMat=new THREE.MeshStandardMaterial({color:0x78949e,roughness:.35,metalness:.1,emissive:0x0b1c23,emissiveIntensity:.15});
  for(let floor=0;floor<floors;floor++) for(let wx=-2;wx<=2;wx++){
    const w1=new THREE.Mesh(new THREE.BoxGeometry(1.3,1,.08),winMat);
    w1.position.set(cx+wx*4.1,2.4+floor*3.6,cz-d/2-.06);scene.add(w1);
  }
}
for(let i=0;i<90;i++){
  const x=(Math.random()-.5)*430,z=(Math.random()-.5)*430;
  if(Math.abs(x%blockSpan)<9||Math.abs(z%blockSpan)<9)continue;
  tree(x,z);
}

const player=new THREE.Group();
player.position.set(-8,0,8);
const playerBody=new THREE.Mesh(new THREE.CapsuleGeometry(.34,.95,4,8),material(0x3e5a72,1,0));
playerBody.position.y=1;playerBody.castShadow=true;player.add(playerBody);
const playerHead=new THREE.Mesh(new THREE.SphereGeometry(.38,16,12),material(0xc9926f,1,0));
playerHead.position.y=2.05;playerHead.castShadow=true;player.add(playerHead);
scene.add(player);

const car=new THREE.Group();
car.position.set(5,.66,11);car.rotation.y=carHeading;scene.add(car);
const body=new THREE.Mesh(new THREE.BoxGeometry(2.2,.72,4.2),material(0x2b66a0,.35,.35));
body.castShadow=true;body.receiveShadow=true;car.add(body);
const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.85,.58,2.1),material(0x152430,.25,.15));
cabin.position.y=.58;cabin.castShadow=true;car.add(cabin);
const wheelGeo=new THREE.CylinderGeometry(.48,.48,.26,16),wheelMat=material(0x15181a,.9,0);
for(const x of[-1,1])for(const z of[-1.45,1.45]){
  const w=new THREE.Mesh(wheelGeo,wheelMat);w.rotation.z=Math.PI/2;w.position.set(x*.98,-.2,z);w.castShadow=true;car.add(w);
}

const npcs=[];
for(let i=0;i<28;i++){
  const n=new THREE.Group();
  n.position.set((Math.floor(Math.random()*8)-4)*blockSpan+(Math.random()-.5)*8,0,(Math.floor(Math.random()*8)-4)*blockSpan+(Math.random()-.5)*8);
  const m=new THREE.Mesh(new THREE.CapsuleGeometry(.27,.75,4,8),material([0x526f58,0x8a5e48,0x725b7b,0x444e5a][i%4],1,0));
  m.position.y=.78;m.castShadow=true;n.add(m);scene.add(n);
  npcs.push({mesh:n,angle:Math.random()*Math.PI*2,speed:.45+Math.random()*.6});
}

const traffic=[];
for(let i=0;i<14;i++){
  const t=box(1.5,.55,2.8,[0xd58d59,0x809ab2,0x9e9e9e,0x456d65][i%4],0,.38,0);
  t.position.set((Math.random()-.5)*380,.38,Math.round((Math.random()*7-3.5))*blockSpan);
  traffic.push({mesh:t,speed:5+Math.random()*7,axis:Math.random()>.5?'x':'z'});
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
  const forward=new THREE.Vector3(Math.sin(playerYaw),0,-Math.cos(playerYaw));
  const right=new THREE.Vector3(Math.cos(playerYaw),0,Math.sin(playerYaw));
  const dir=new THREE.Vector3();
  if(keysDown('KeyW'))dir.add(forward);
  if(keysDown('KeyS'))dir.sub(forward);
  if(keysDown('KeyD'))dir.add(right);
  if(keysDown('KeyA'))dir.sub(right);
  if(dir.lengthSq()>0){
    dir.normalize();
    const speed=(keysDown('ShiftLeft')||keysDown('ShiftRight'))?10:5.7;
    player.position.addScaledVector(dir,speed*dt);
    player.rotation.y=playerYaw;
  }
  player.position.x=THREE.MathUtils.clamp(player.position.x,-248,248);
  player.position.z=THREE.MathUtils.clamp(player.position.z,-248,248);
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
  car.position.x=THREE.MathUtils.clamp(car.position.x,-248,248);
  car.position.z=THREE.MathUtils.clamp(car.position.z,-248,248);
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
    if(t.axis==='x')t.mesh.position.x+=t.speed*dt;
    else t.mesh.position.z+=t.speed*dt;
    if(t.mesh.position.x>255)t.mesh.position.x=-255;
    if(t.mesh.position.z>255)t.mesh.position.z=-255;
  }
}

function updateCamera(){
  const target=inCar?car.position.clone().add(new THREE.Vector3(0,.7,0)):player.position.clone().add(new THREE.Vector3(0,1.25,0));
  if(cameraMode==='first'){
    const heading=inCar?carHeading:playerYaw;
    const forward=new THREE.Vector3(Math.sin(heading),0,-Math.cos(heading));
    const pos=target.clone().add(new THREE.Vector3(0,inCar?1.45:.95,0));
    const look=pos.clone().addScaledVector(forward,12);
    look.y+=Math.tan(playerPitch)*4;
    camera.position.lerp(pos,.2);camera.lookAt(look);
  }else{
    const heading=inCar?carHeading:playerYaw;
    const back=new THREE.Vector3(-Math.sin(heading),0,Math.cos(heading));
    const desired=target.clone().addScaledVector(back,inCar?8.5:5.6).add(new THREE.Vector3(0,inCar?3.2:2.7,0));
    camera.position.lerp(desired,.12);camera.lookAt(target);
  }
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
  const sensitivity=.0022;
  playerYaw-=e.movementX*sensitivity;
  playerPitch=THREE.MathUtils.clamp(playerPitch-e.movementY*sensitivity,-.9,.6);
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
animate();
