import * as THREE from './vendor/three.module.min.js';
import {tileCenter,BUILDINGS,ROUTE,routeSamples} from './model.mjs';

const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.88,side:THREE.DoubleSide,...extra});
export const COVER_COLORS={grass:0x9eb879,crop:0xc2b06d,soil:0xae8860,paving:0xb7bcb5,water:0x62aeb9,forest:0x6f9464};
export function createLandscape(design){
 const group=new THREE.Group(),pickables=[],occluders=[],treeGroups=new Map();
 const materials=new Map(),geometries=new Map();
 const material=(key,color,extra)=>{if(!materials.has(key))materials.set(key,mat(color,extra));return materials.get(key);};
 const geo=(key,fn)=>{if(!geometries.has(key))geometries.set(key,fn());return geometries.get(key);};
 const box=geo('box',()=>new THREE.BoxGeometry(1,1,1));
 const sphere=geo('crown',()=>new THREE.IcosahedronGeometry(1,2));
 const trunkgeo=geo('trunk',()=>new THREE.CylinderGeometry(.65,1,1,8));
 const cone=geo('cone',()=>new THREE.ConeGeometry(1,1,10));
 function mesh(geometry,material,parent,x,y,z,sx=1,sy=1,sz=1,metadata=null,shade=true){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=shade;m.receiveShadow=true;parent.add(m);if(metadata){m.userData=metadata;pickables.push(m);}if(shade)occluders.push(m);return m;}
 mesh(box,material('earth',0x776447),group,0,-1.6,0,80,3.15,80,null,false);
 mesh(box,material('base-edge',0x465d4c),group,0,-3.27,0,80.5,.3,80.5,null,false);
 design.cover.forEach((cover,index)=>{
  const p=tileCenter(index),data={kind:'tile',index};
  mesh(box,material(cover,COVER_COLORS[cover],cover==='water'?{roughness:.28,metalness:.12}:{}),group,p.x,-.055,p.z,7.97,.1,7.97,data,false);
  if(cover==='crop'){
   const rows=new THREE.InstancedMesh(box,material('crop-row',0x969c54),6);const m=new THREE.Matrix4();
   for(let r=0;r<6;r++)m.compose(new THREE.Vector3(p.x-3.2+r*1.28,.15,p.z),new THREE.Quaternion(),new THREE.Vector3(.35,.28,7.2)),rows.setMatrixAt(r,m);
   rows.receiveShadow=true;group.add(rows);
  }
  if(cover==='water'){
   const rows=new THREE.InstancedMesh(box,material('water-line',0x91c6c8,{roughness:.3}),3),m=new THREE.Matrix4();
   for(let r=0;r<3;r++)m.compose(new THREE.Vector3(p.x-1+(r%2)*2,.008,p.z-2+r*2),new THREE.Quaternion(),new THREE.Vector3(2.5,.006,.035)),rows.setMatrixAt(r,m);
   group.add(rows);
  }
 });
 // A fixed raised boardwalk makes every part of the route walkable, including the pond edge.
 const pathmat=material('path',0xe5dac0),trim=material('path-trim',0xc2ad86);
 ROUTE.slice(1).forEach((b,i)=>{const a=ROUTE[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);const p=mesh(box,pathmat,group,(a[0]+b[0])/2,.07,(a[1]+b[1])/2,1.65,.12,length,null,false);p.rotation.y=Math.atan2(b[0]-a[0],b[1]-a[1]);});
 for(const p of ROUTE)mesh(geo('joint',()=>new THREE.CylinderGeometry(.825,.825,.12,16)),pathmat,group,p[0],.07,p[1],1,1,1,null,false);
 // Houses use closed gable meshes, so measured occlusion follows the visible roof.
 const roofGeo=geo('roof',()=>{
  const g=new THREE.BufferGeometry(),v=[-.5,0,-.5,.5,0,-.5,0,1,-.5,-.5,0,.5,.5,0,.5,0,1,.5];
  g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex([0,2,1,3,4,5,0,3,5,0,5,2,1,2,5,1,5,4,0,1,4,0,4,3]);g.computeVertexNormals();return g;
 });
 BUILDINGS.forEach((b,i)=>{
  const data={kind:'building',index:i};
  mesh(box,material('house-'+i,b.color),group,b.x,b.h/2,b.z,b.w,b.h,b.d,data);
  mesh(roofGeo,material('roof-'+i,i%2?0x6f807d:0xb66f51),group,b.x,b.h,b.z,b.w+.65,b.roof,b.d+.65,data);
  mesh(box,material('chimney',0xa28f77),group,b.x+b.w*.25,b.h+b.roof*.6,b.z-1,.7,2,.7,data);
  const win=material('window',0x355967,{roughness:.3}),frame=material('frame',0xf4ecd9);
  for(let floor=0;floor<(b.h>7?2:1);floor++)for(const side of [-1,1]){
   mesh(box,frame,group,b.x+side*b.w*.27,2+floor*3,b.z+b.d/2+.025,1.15,1.6,.08,data,false);
   mesh(box,win,group,b.x+side*b.w*.27,2+floor*3,b.z+b.d/2+.08,.88,1.28,.08,data,false);
  }
  mesh(box,material('door',0x656b55),group,b.x,1.2,b.z+b.d/2+.05,.95,2.4,.1,data,false);
  mesh(box,trim,group,b.x,.12,b.z+b.d/2+1,1.5,.22,1.8,null,false);
 });
 design.trees.forEach((t,index)=>{
  const g=new THREE.Group();g.position.set(t.x,0,t.z);g.userData={kind:'tree',id:t.id};group.add(g);treeGroups.set(t.id,g);
  const data={kind:'tree',id:t.id};
  const bark=material('bark',0x74634b),h=t.height,r=t.radius;
  mesh(trunkgeo,bark,g,0,h*.29,0,.16+h*.025,h*.58,.16+h*.025,data);
  if(t.type==='conifer'){
   const greens=[0x3f6d55,0x4b7b5c,0x528563];
   [[.48,.61,1],[.65,.5,.8],[.82,.36,.52]].forEach((v,n)=>mesh(cone,material('needle-'+n,greens[n]),g,0,h*v[0],0,r*v[2],h*v[1],r*v[2],data));
  }else{
   const color=t.type==='young'?0x8faf64:[0x6c945c,0x739b60,0x7e9e60,0x608657][index%4];
   const leaf=material('leaves-'+color,color);
   mesh(sphere,leaf,g,0,h*.76,0,r,h*.24,r,data);
   [[-.36,.68,.08,.62],[.32,.72,.24,.6],[.04,.65,-.35,.6]].forEach(v=>mesh(sphere,leaf,g,r*v[0],h*v[1],r*v[2],r*v[3],h*.21,r*v[3],data));
   for(const sign of [-1,1]){const branch=mesh(trunkgeo,bark,g,sign*r*.16,h*.47,0,.1+h*.008,h*.3,.1+h*.008,data);branch.rotation.z=-sign*.48;}
  }
 });
 // Two benches give the landscape a human scale.
 for(const [x,z] of [[-18,8],[4,24]]){
  mesh(box,material('bench-wood',0x9f774f),group,x,.58,z,2.3,.16,.7,null);
  mesh(box,material('bench-wood',0x9f774f),group,x,1,z+.3,2.3,.6,.12,null);
  for(const dx of [-.85,.85])mesh(box,material('bench-leg',0x4f6058),group,x+dx,.3,z,.12,.6,.55,null);
 }
 group.updateMatrixWorld(true);
 return {group,pickables,occluders,treeGroups,dispose(){for(const g of geometries.values())g.dispose();for(const m of materials.values())m.dispose();}};
}
const route=routeSamples(.8);
export function measureShade(landscape,sun,dni,points=route.samples){
 landscape.group.updateMatrixWorld(true);
 if(sun.y<=0)return {shade:null,beam:0,flags:points.map(()=>null),count:points.length,length:route.length};
 const direction=new THREE.Vector3(sun.x,sun.y,sun.z).normalize(),ray=new THREE.Raycaster(undefined,direction,.01,400);
 const flags=points.map(p=>{ray.set(new THREE.Vector3(p.x,p.y??.18,p.z),direction);return ray.intersectObjects(landscape.occluders,false).length>0;});
 const total=points.reduce((n,p)=>n+(p.weight??1),0),shaded=points.reduce((n,p,i)=>n+(flags[i]?(p.weight??1):0),0),shade=total?shaded/total:0;
 return {shade,beam:dni*Math.max(0,sun.y)*(1-shade),flags,count:points.length,length:route.length};
}
export function createRouteDots(){
 const geometry=new THREE.CircleGeometry(.19,10),material=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide});
 const mesh=new THREE.InstancedMesh(geometry,material,route.samples.length),dummy=new THREE.Object3D();
 route.samples.forEach((p,i)=>{dummy.position.set(p.x,.145,p.z);dummy.rotation.x=-Math.PI/2;dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new THREE.Color(0xe6b756));});
 mesh.renderOrder=2;return {mesh,update(flags){flags.forEach((f,i)=>mesh.setColorAt(i,new THREE.Color(f===null?0x929a96:f?0x559ddd:0xe4a733)));mesh.instanceColor.needsUpdate=true;}};
}
