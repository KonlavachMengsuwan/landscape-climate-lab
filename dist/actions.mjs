import {canPlant,tileCenter,BUILDINGS,TREE_FORMS,COVERS} from './model.mjs';
export function plantTree(design,x,z,type='broadleaf'){
 x=Math.round(x*100)/100;z=Math.round(z*100)/100;
 const error=canPlant(design,x,z);if(error)return {error};
 if(!Object.hasOwn(TREE_FORMS,type))return {error:'Choose a tree form.'};
 const tree={id:'t-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),type,x:Math.round(x*100)/100,z:Math.round(z*100)/100,height:TREE_FORMS[type].height,radius:TREE_FORMS[type].radius};
 design.trees.push(tree);return {tree};
}
export function paintCover(design,index,cover){
 if(!Number.isInteger(index)||index<0||index>=100||!COVERS.includes(cover))return {error:'Choose a ground tile and land cover.'};
 const p=tileCenter(index);
 if(cover==='water'&&BUILDINGS.some(b=>Math.abs(p.x-b.x)<4+b.w/2&&Math.abs(p.z-b.z)<4+b.d/2))return {error:'Keep the village foundations on dry ground.'};
 if(design.cover[index]===cover)return {changed:false};
 const original=design.trees.length;design.cover[index]=cover;
 if(cover==='water')design.trees=design.trees.filter(t=>!(t.x>=p.x-4&&t.x<p.x+4&&t.z>=p.z-4&&t.z<p.z+4));
 if(cover==='forest')for(const [dx,dz] of [[-2,-2],[2,2],[-2,2]])plantTree(design,p.x+dx,p.z+dz,'broadleaf');
 return {changed:true,removed:Math.max(0,original-design.trees.length),added:Math.max(0,design.trees.length-original)};
}
export function moveTree(design,id,x,z){x=Math.round(x*100)/100;z=Math.round(z*100)/100;const tree=design.trees.find(t=>t.id===id);if(!tree)return {error:'Select a tree first.'};const error=canPlant(design,x,z,id);if(error)return {error};tree.x=Math.round(x*100)/100;tree.z=Math.round(z*100)/100;return {tree};}
