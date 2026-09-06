import * as THREE from './vendor/three.module.min.js';
import {SVGRenderer} from './vendor/SVGRenderer.js';

// A genuine geometry renderer for browsers without WebGL. It does not render shadows.
// The analysis continues to raycast the original Three.js meshes independently.
export class CompatibilityRenderer extends SVGRenderer {
 constructor(){super();const nativeRender=this.render.bind(this);this.render=(scene,camera)=>this.renderCompatible(scene,camera,nativeRender);this.shadowMap={enabled:false,autoUpdate:false,needsUpdate:false};this.setPrecision(2);this.setQuality('high');this.instanceCache=new WeakMap();this.fill=new THREE.AmbientLight(0xa3aba6);this.isCompatibilityRenderer=true;}
 setPixelRatio(){}
 renderCompatible(scene,camera,nativeRender){
  scene.updateMatrixWorld(true);const instances=[],lights=[];scene.traverseVisible(o=>{if(o.isInstancedMesh)instances.push(o);if(o.isDirectionalLight)lights.push([o,o.intensity]);});
  const proxies=[],orders=[],sides=new Map();
  for(const original of instances){
   let record=this.instanceCache.get(original);
   if(!record||record.children.length!==original.count){const group=new THREE.Group();for(let i=0;i<original.count;i++){const m=new THREE.Mesh(original.geometry,original.material.clone());m.matrixAutoUpdate=false;group.add(m);}record=group;this.instanceCache.set(original,record);}
   for(let i=0;i<original.count;i++){const child=record.children[i],matrix=new THREE.Matrix4();original.getMatrixAt(i,matrix);child.matrix.multiplyMatrices(original.matrixWorld,matrix);child.material.color.copy(original.material.color);if(original.instanceColor){const color=new THREE.Color();original.getColorAt(i,color);child.material.color.multiply(color);}child.material.opacity=original.material.opacity;child.material.transparent=original.material.transparent;}
   original.visible=false;scene.add(record);proxies.push(record);
  }
  for(const [light,intensity] of lights)light.intensity=Math.min(1.15,intensity*.34);
  scene.add(this.fill);
  scene.traverseVisible(o=>{if(!o.isMesh)return;orders.push([o,o.renderOrder]);const m=o.matrixWorld;const y=o.matrixAutoUpdate?o.getWorldPosition(new THREE.Vector3()).y:m.elements[13];if(o.userData.kind==='tile')o.renderOrder=-90;else if(y<-.1)o.renderOrder=-100;else if(y<.3)o.renderOrder=-80;for(const material of (Array.isArray(o.material)?o.material:[o.material])){if(!sides.has(material))sides.set(material,material.side);material.side=THREE.FrontSide;}});
  try{nativeRender(scene,camera);}finally{for(const [o,order] of orders)o.renderOrder=order;for(const [m,side] of sides)m.side=side;scene.remove(this.fill);for(const p of proxies)scene.remove(p);for(const o of instances)o.visible=true;for(const [light,intensity] of lights)light.intensity=intensity;}
 }
}
