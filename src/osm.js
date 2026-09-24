import * as THREE from 'three';

const CENTER={lat:28.60394,lon:77.42722};
const BBOX={south:28.565,west:77.39,north:28.645,east:77.49};
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
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
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
