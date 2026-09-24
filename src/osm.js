import * as THREE from 'three';

const CENTER={lat:28.5905,lon:77.445};
const BBOX={south:28.555,west:77.405,north:28.625,east:77.49};

// Curated Greater Noida West gameplay boundary enclosing the recognized GNW
// sector belt described in current area references. This is a game boundary,
// not a claim of an official administrative polygon.
const GAME_POLYGON=[
  [28.622,77.405],
  [28.622,77.462],
  [28.610,77.490],
  [28.565,77.490],
  [28.553,77.455],
  [28.553,77.412],
  [28.580,77.395]
];
const GAME_POLYGON_QUERY=GAME_POLYGON.map(([lat,lon])=>lat+' '+lon).join(' ');
const M_PER_DEG_LAT=111320;
const M_PER_DEG_LON=M_PER_DEG_LAT*Math.cos(CENTER.lat*Math.PI/180);

const OVERPASS=[
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

const WIDTHS={
  motorway:12,trunk:11,primary:9,secondary:8,tertiary:6,
  unclassified:5,residential:4.8,living_street:4,service:3.2
};

function project(lat,lon){
  return new THREE.Vector3(
    (lon-CENTER.lon)*M_PER_DEG_LON,
    0,
    -(lat-CENTER.lat)*M_PER_DEG_LAT
  );
}

function roadMaterial(){
  return new THREE.MeshStandardMaterial({
    color:0x31363b,roughness:0.96,metalness:0,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1
  });
}

function edgeMaterial(){
  return new THREE.LineBasicMaterial({color:0x6d7479,transparent:true,opacity:.32});
}

function makeRoadMesh(ways){
  const positions=[];
  const edges=[];
  const segments=[];
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;

  for(const way of ways){
    const highway=way?.tags?.highway;
    const width=WIDTHS[highway]??4;
    const geom=way?.geometry??[];
    if(geom.length<2)continue;

    for(let i=1;i<geom.length;i++){
      const a=project(geom[i-1].lat,geom[i-1].lon);
      const b=project(geom[i].lat,geom[i].lon);
      const dx=b.x-a.x,dz=b.z-a.z;
      const len=Math.hypot(dx,dz);
      if(len<1.5||len>600)continue;

      const nx=-dz/len*width/2;
      const nz=dx/len*width/2;

      positions.push(
        a.x+nx,.06,a.z+nz,
        a.x-nx,.06,a.z-nz,
        b.x+nx,.06,b.z+nz,
        a.x-nx,.06,a.z-nz,
        b.x-nx,.06,b.z-nz,
        b.x+nx,.06,b.z+nz
      );

      edges.push(a.x,.11,a.z,b.x,.11,b.z);

      segments.push({
        a,b,width,highway,
        midpoint:new THREE.Vector3((a.x+b.x)/2,.15,(a.z+b.z)/2),
        heading:Math.atan2(-(b.x-a.x),-(b.z-a.z)),
        length:len
      });

      minX=Math.min(minX,a.x,b.x);maxX=Math.max(maxX,a.x,b.x);
      minZ=Math.min(minZ,a.z,b.z);maxZ=Math.max(maxZ,a.z,b.z);
    }
  }

  const group=new THREE.Group();

  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,roadMaterial());
  mesh.receiveShadow=true;
  group.add(mesh);

  const edgeGeometry=new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(edges,3));
  const edgeLines=new THREE.LineSegments(edgeGeometry,edgeMaterial());
  group.add(edgeLines);

  return {group,segments,bounds:{minX,maxX,minZ,maxZ}};
}

function addRoadMarkings(group,segments){
  const markPositions=[];
  for(const s of segments){
    if(!['primary','secondary','tertiary'].includes(s.highway))continue;
    if(s.length<15)continue;
    const dx=(s.b.x-s.a.x)/s.length;
    const dz=(s.b.z-s.a.z)/s.length;
    for(let d=7;d<s.length-7;d+=16){
      const x=s.a.x+dx*d,z=s.a.z+dz*d;
      const half=.35;
      const px=-dz*half,pz=dx*half;
      markPositions.push(
        x+px,.075,z+pz,x-px,.075,z-pz
      );
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(markPositions,3));
  group.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0xd4bd6a,transparent:true,opacity:.7})));
}

function parseRoadJson(json){
  const ways=(json.elements??[]).filter(e=>e.type==='way'&&e.geometry?.length>1);
  if(!ways.length)throw new Error('No road geometry returned');
  const road=makeRoadMesh(ways);
  addRoadMarkings(road.group,road.segments);
  road.group.name='OpenStreetMap Roads';
  return {...road,center:CENTER,bbox:BBOX,source:'OpenStreetMap contributors'};
}

export async function loadBundledOSMRoadNetwork(){
  const response=await fetch('./src/data/osm-roads.json',{cache:'no-store'});
  if(!response.ok)throw new Error(`Bundled map HTTP ${response.status}`);
  return parseRoadJson(await response.json());
}

export async function loadOSMRoadNetwork(){
  const query=`[out:json][timeout:35];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$"](poly:"${GAME_POLYGON_QUERY}");
);
out geom;
`;

  let lastError;
  for(const endpoint of OVERPASS){
    try{
      const response=await fetch(endpoint,{
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body:new URLSearchParams({data:query})
      });
      if(!response.ok)throw new Error(`Overpass HTTP ${response.status}`);
      return parseRoadJson(await response.json());
    }catch(error){
      lastError=error;
    }
  }
  throw lastError??new Error('Unable to load OpenStreetMap data');
}


const BUILDING_TYPES=['apartments','commercial','retail','office','school','hospital','industrial','house','yes'];
const BUILDING_MATS=[
  new THREE.MeshStandardMaterial({color:0xb9ab96,roughness:.9}),
  new THREE.MeshStandardMaterial({color:0xd2c1aa,roughness:.88}),
  new THREE.MeshStandardMaterial({color:0x8d9da8,roughness:.86}),
  new THREE.MeshStandardMaterial({color:0xc49a79,roughness:.9}),
  new THREE.MeshStandardMaterial({color:0x9c9ba2,roughness:.88}),
  new THREE.MeshStandardMaterial({color:0xb4bda8,roughness:.9})
];

function buildingHeight(tags,index){
  const explicit=Number.parseFloat(tags?.height);
  if(Number.isFinite(explicit)&&explicit>1) return Math.min(explicit,110);
  const levels=Number.parseFloat(tags?.['building:levels']);
  if(Number.isFinite(levels)&&levels>0) return Math.min(2.9+levels*3.1,105);
  const type=tags?.building;
  if(type==='house')return 5.5;
  if(['industrial','warehouse'].includes(type))return 7+((index%3)*1.5);
  if(['school','hospital'].includes(type))return 11+((index%3)*2);
  return 9+((index%7)*2.6);
}

function makeBuildingMesh(element,index){
  const geom=element.geometry??[];
  if(geom.length<3)return null;
  const points=geom.map(p=>project(p.lat,p.lon));
  const shape=new THREE.Shape();
  shape.moveTo(points[0].x,points[0].z);
  for(let i=1;i<points.length;i++)shape.lineTo(points[i].x,points[i].z);
  shape.closePath();

  const height=buildingHeight(element.tags,index);
  const extrude=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,curveSegments:1});
  extrude.rotateX(-Math.PI/2);

  const group=new THREE.Group();
  const mesh=new THREE.Mesh(extrude,BUILDING_MATS[index%BUILDING_MATS.length]);
  mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);

  const box=new THREE.Box3().setFromPoints(points);
  const cx=(box.min.x+box.max.x)/2,cz=(box.min.z+box.max.z)/2;
  const width=box.max.x-box.min.x,depth=box.max.z-box.min.z;

  if(height>15&&width>10&&depth>10){
    const roofMat=new THREE.MeshStandardMaterial({color:0x6b7074,roughness:.8,metalness:.15});
    const roof=new THREE.Mesh(new THREE.BoxGeometry(Math.max(2,width*.82),.28,Math.max(2,depth*.82)),roofMat);
    roof.position.set(cx,height+.14,cz);roof.castShadow=true;roof.receiveShadow=true;group.add(roof);

    const tank=new THREE.Mesh(new THREE.CylinderGeometry(Math.min(width,depth)*.06,Math.min(width,depth)*.06,1.2,12),new THREE.MeshStandardMaterial({color:0xa7b0b3,roughness:.65,metalness:.15}));
    tank.position.set(cx+width*.18,height+.9,cz-depth*.15);tank.castShadow=true;group.add(tank);
  }

  if(width>8&&depth>8&&height>7){
    const floorCount=Math.max(1,Math.min(10,Math.floor(height/3.2)));
    const windowMat=new THREE.MeshStandardMaterial({color:0x456875,roughness:.28,metalness:.15,emissive:0x09151b,emissiveIntensity:.15});
    const maxWindows=Math.min(8,Math.max(2,Math.floor(width/4)));
    for(let floor=0;floor<floorCount;floor++){
      for(let w=0;w<maxWindows;w++){
        const wx=(w-(maxWindows-1)/2)*(width*.72/Math.max(1,maxWindows-1));
        const win=new THREE.Mesh(new THREE.BoxGeometry(Math.min(1.6,width*.1),1.05,.06),windowMat);
        win.position.set(cx+wx,1.5+floor*3.15,box.min.z-.06);
        win.castShadow=false;win.receiveShadow=false;group.add(win);
      }
    }
  }

  return group;
}

export function createOSMBuildingGroup(json){
  const group=new THREE.Group();
  group.name='OpenStreetMap Buildings';
  const elements=(json.elements??[]).filter(e=>e.type==='way'&&e.tags?.building&&e.geometry?.length>=3);
  const max=Math.min(elements.length,1800);
  for(let i=0;i<max;i++){
    const b=makeBuildingMesh(elements[i],i);
    if(b)group.add(b);
  }
  return {group,count:max};
}

export async function loadOSMBuildingNetwork(){
  const query='[out:json][timeout:45];\n'+
    '(\n'+
    '  way["building"](poly:"'+GAME_POLYGON_QUERY+'");\n'+
    ');\n'+
    'out geom;\n';

  let lastError;
  for(const endpoint of OVERPASS){
    try{
      const response=await fetch(endpoint,{
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body:new URLSearchParams({data:query})
      });
      if(!response.ok)throw new Error('Overpass building HTTP '+response.status);
      return createOSMBuildingGroup(await response.json());
    }catch(error){
      lastError=error;
    }
  }
  throw lastError??new Error('Unable to load OpenStreetMap building data');
}

export async function loadBundledOSMBuildingNetwork(){
  const response=await fetch('./src/data/osm-buildings.json',{cache:'no-store'});
  if(!response.ok)throw new Error(`Bundled building map HTTP ${response.status}`);
  return createOSMBuildingGroup(await response.json());
}
