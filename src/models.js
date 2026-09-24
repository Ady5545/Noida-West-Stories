import * as THREE from 'three';

const mat=(color,roughness=.8,metalness=0,emissive=0,emissiveIntensity=0)=>{
  const m=new THREE.MeshStandardMaterial({color,roughness,metalness});
  if(emissive){m.emissive=new THREE.Color(emissive);m.emissiveIntensity=emissiveIntensity;}
  return m;
};

export function createCityrunner(){
  const g=new THREE.Group();
  g.name='Cityrunner S1';

  const bodyMat=mat(0x2f6da7,.34,.32);
  const darkMat=mat(0x17232d,.25,.15);
  const trimMat=mat(0x20262b,.5,.45);
  const chromeMat=mat(0xb7c0c7,.22,.8);
  const lightMat=mat(0xf4f0cf,.15,.08,0xfff5bb,.65);
  const tailMat=mat(0x9b2a2a,.3,.1,0x4b0000,.35);

  const body=new THREE.Mesh(new THREE.BoxGeometry(2.25,.72,4.35),bodyMat);
  body.position.y=.72;body.castShadow=true;body.receiveShadow=true;g.add(body);

  const hood=new THREE.Mesh(new THREE.BoxGeometry(2.08,.22,1.1),bodyMat);
  hood.position.set(0,1.08,-1.35);hood.castShadow=true;g.add(hood);

  const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.88,.72,2.2),darkMat);
  cabin.position.set(0,1.25,.25);cabin.castShadow=true;g.add(cabin);

  const windshield=new THREE.Mesh(new THREE.BoxGeometry(1.72,.46,.06),darkMat);
  windshield.position.set(0,1.3,-.63);windshield.rotation.x=-.18;g.add(windshield);

  const rearGlass=new THREE.Mesh(new THREE.BoxGeometry(1.7,.44,.06),darkMat);
  rearGlass.position.set(0,1.3,1.08);rearGlass.rotation.x=.18;g.add(rearGlass);

  const sideGlassMat=mat(0x0d1a23,.18,.1);
  for(const x of[-.95,.95]){
    const front=new THREE.Mesh(new THREE.BoxGeometry(.04,.42,.78),sideGlassMat);
    front.position.set(x,1.27,-.18);front.rotation.y=x>0?.05:-.05;g.add(front);
    const rear=new THREE.Mesh(new THREE.BoxGeometry(.04,.42,.72),sideGlassMat);
    rear.position.set(x,1.27,.63);rear.rotation.y=x>0?.05:-.05;g.add(rear);
  }

  const grille=new THREE.Mesh(new THREE.BoxGeometry(1.05,.3,.08),trimMat);
  grille.position.set(0,.68,-2.19);g.add(grille);

  const frontBumper=new THREE.Mesh(new THREE.BoxGeometry(2.1,.18,.16),chromeMat);
  frontBumper.position.set(0,.48,-2.2);g.add(frontBumper);

  const rearBumper=new THREE.Mesh(new THREE.BoxGeometry(2.1,.18,.16),trimMat);
  rearBumper.position.set(0,.48,2.2);g.add(rearBumper);

  for(const x of[-.7,.7]){
    const l=new THREE.Mesh(new THREE.BoxGeometry(.44,.18,.06),lightMat);
    l.position.set(x,.87,-2.19);g.add(l);
  }
  for(const x of[-.72,.72]){
    const l=new THREE.Mesh(new THREE.BoxGeometry(.34,.16,.06),tailMat);
    l.position.set(x,.85,2.2);g.add(l);
  }

  for(const x of[-1.22,1.22]){
    const mirror=new THREE.Mesh(new THREE.BoxGeometry(.14,.12,.28),trimMat);
    mirror.position.set(x,1.32,-.4);g.add(mirror);
  }

  const doorTrim=mat(0x96b3cb,.35,.22);
  for(const x of[-1.13,1.13]){
    const trim=new THREE.Mesh(new THREE.BoxGeometry(.05,.07,1.55),doorTrim);
    trim.position.set(x,.72,.35);g.add(trim);
    for(const z of[-.18,.68]){
      const handle=new THREE.Mesh(new THREE.BoxGeometry(.07,.05,.2),chromeMat);
      handle.position.set(x>0?x+.025:x-.025,1.02,z);g.add(handle);
    }
  }

  const wheelGeo=new THREE.CylinderGeometry(.5,.5,.28,24);
  const tireMat=mat(0x121519,.9,0);
  const rimMat=mat(0x88939b,.28,.8);
  for(const x of[-1,1])for(const z of[-1.48,1.48]){
    const tire=new THREE.Mesh(wheelGeo,tireMat);
    tire.rotation.z=Math.PI/2;tire.position.set(x*1.03,.36,z);tire.castShadow=true;g.add(tire);
    const rim=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.3,18),rimMat);
    rim.rotation.z=Math.PI/2;rim.position.set(x*1.03,.36,z);g.add(rim);
  }

  const dash=mat(0x10161c,.38,.1);
  const dashboard=new THREE.Mesh(new THREE.BoxGeometry(1.55,.18,.42),dash);
  dashboard.position.set(0,1.02,-.47);g.add(dashboard);

  const steering=new THREE.Mesh(new THREE.TorusGeometry(.18,.035,8,24),trimMat);
  steering.rotation.x=Math.PI/2;steering.position.set(-.5,1.12,-.54);g.add(steering);

  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  return g;
}

export function createPedestrian(seed=0){
  const g=new THREE.Group();
  g.name='Pedestrian';

  const skin=[0xb77958,0xc9926f,0x8e5c45,0xd1a27f][seed%4];
  const shirt=[0x49647b,0x6b7d55,0x7a5062,0x6c637b][seed%4];
  const pants=[0x26323b,0x3b3f49,0x5d5144,0x253d4c][seed%4];
  const skinMat=mat(skin,1,0),shirtMat=mat(shirt,1,0),pantsMat=mat(pants,1,0),shoeMat=mat(0x171a1d,.95,0);

  const torso=new THREE.Mesh(new THREE.BoxGeometry(.58,.88,.34),shirtMat);
  torso.position.y=1.28;g.add(torso);

  const head=new THREE.Mesh(new THREE.SphereGeometry(.28,16,12),skinMat);
  head.position.y=2.02;g.add(head);

  const hair=new THREE.Mesh(new THREE.SphereGeometry(.285,16,8,0,Math.PI*2,0,Math.PI*.48),mat(0x2a221d,1,0));
  hair.position.y=2.1;g.add(hair);
  const eyeWhite=mat(0xf4f1e8,.55,0);
  const eyeDark=mat(0x171717,.45,0);
  const mouthMat=mat(0x7a3f3f,.8,0);

  for(const x of[-.105,.105]){
    const eye=new THREE.Mesh(new THREE.SphereGeometry(.052,10,8),eyeWhite);
    eye.position.set(x,2.04,-.245);g.add(eye);
    const pupil=new THREE.Mesh(new THREE.SphereGeometry(.025,8,6),eyeDark);
    pupil.position.set(x,2.04,-.291);g.add(pupil);
    const brow=new THREE.Mesh(new THREE.BoxGeometry(.11,.025,.035),eyeDark);
    brow.position.set(x,2.13,-.258);brow.rotation.z=x>0?-.08:.08;g.add(brow);
  }

  const nose=new THREE.Mesh(new THREE.ConeGeometry(.045,.13,8),skinMat);
  nose.rotation.x=-Math.PI/2;nose.position.set(0,1.98,-.275);g.add(nose);

  const mouth=new THREE.Mesh(new THREE.BoxGeometry(.12,.035,.025),mouthMat);
  mouth.position.set(0,1.885,-.27);g.add(mouth);

  for(const x of[-.285,.285]){
    const ear=new THREE.Mesh(new THREE.SphereGeometry(.075,10,8),skinMat);
    ear.scale.set(.7,1,1);ear.position.set(x,2.01,-.01);g.add(ear);
  }

  for(const x of[-.4,.4]){
    const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.11,.55,5,8),shirtMat);
    arm.position.set(x,1.28,0);arm.rotation.z=x>0?-.08:.08;g.add(arm);
  }
  for(const x of[-.17,.17]){
    const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.12,.68,5,8),pantsMat);
    leg.position.set(x,.55,0);g.add(leg);
    const shoe=new THREE.Mesh(new THREE.BoxGeometry(.2,.12,.36),shoeMat);
    shoe.position.set(x,.12,-.07);g.add(shoe);
  }

  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  return g;
}

export function createTree(seed=0){
  const g=new THREE.Group();
  const trunkMat=mat(0x70503c,1,0);
  const leafMat=mat([0x3e7149,0x477b4c,0x356b4b][seed%3],1,0);
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.16,.22,2.8,10),trunkMat);
  trunk.position.y=1.4;g.add(trunk);
  for(let i=0;i<3;i++){
    const crown=new THREE.Mesh(new THREE.SphereGeometry(1.15-i*.12,14,10),leafMat);
    crown.scale.set(1.05,1.15,1.05);
    crown.position.set((i-1)*.5,3.2+i*.35,(i%2?-.28:.25));
    g.add(crown);
  }
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  return g;
}

export function createStreetlight(){
  const g=new THREE.Group();
  const poleMat=mat(0x51595f,.55,.65);
  const lampMat=mat(0xe3d8ad,.24,.15,0xffde73,.75);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.07,.1,5.8,12),poleMat);
  pole.position.y=2.9;g.add(pole);
  const arm=new THREE.Mesh(new THREE.BoxGeometry(1.1,.09,.09),poleMat);
  arm.position.set(.5,5.55,0);g.add(arm);
  const lamp=new THREE.Mesh(new THREE.SphereGeometry(.16,12,10),lampMat);
  lamp.position.set(1.0,5.44,0);g.add(lamp);
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  return g;
}
