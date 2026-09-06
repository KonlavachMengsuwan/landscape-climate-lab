import * as THREE from './vendor/three.module.min.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {initialDesign,initialSun,deepCopy,sunPosition,tileIndex,tileCenter,TREE_FORMS,BUILDINGS,blockedByBuilding,onRoute,parseScenario,scenarioJSON} from './model.mjs';
import {createLandscape,measureShade,createRouteDots} from './scene.mjs';
import {plantTree,paintCover,moveTree} from './actions.mjs';
import {createTemperatureLayer} from './thermal-ui.mjs';
import {initialThermal} from './thermal.mjs';
import {CompatibilityRenderer} from './compat-renderer.mjs';

const $=id=>document.getElementById(id),all=q=>[...document.querySelectorAll(q)];
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}catch(error){
 renderer=new CompatibilityRenderer();document.body.classList.add('compatibility-mode');const note=document.createElement('div');note.className='compatibility-note';note.textContent='Compatibility view · simplified lighting, no rendered shadows';note.title='Shade and surface-temperature calculations still use the original 3D geometry.';document.querySelector('.world-panel').append(note);
}
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
$('viewport').appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-hidden','true');
const scene=new THREE.Scene();scene.background=new THREE.Color(0xc2d9d9);scene.fog=new THREE.Fog(0xc2d9d9,190,400);
const camera=new THREE.PerspectiveCamera(43,1,.08,500);camera.position.set(78,72,93);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,2,0);controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=10;controls.maxDistance=320;controls.maxPolarAngle=Math.PI*.47;controls.minPolarAngle=.02;controls.enablePan=true;controls.screenSpacePanning=false;
const skyLight=new THREE.HemisphereLight(0xedf5f3,0x637452,2);scene.add(skyLight);
const sunlight=new THREE.DirectionalLight(0xffefd0,3.1);sunlight.castShadow=true;sunlight.shadow.mapSize.set(2048,2048);Object.assign(sunlight.shadow.camera,{left:-66,right:66,top:66,bottom:-66,near:1,far:290});sunlight.shadow.camera.updateProjectionMatrix();sunlight.shadow.bias=-.00015;sunlight.shadow.normalBias=.025;scene.add(sunlight,sunlight.target);
let design=initialDesign(),baseline=deepCopy(design),sun=initialSun();
let currentLandscape=createLandscape(design),baselineLandscape=createLandscape(baseline);scene.add(currentLandscape.group,baselineLandscape.group);baselineLandscape.group.visible=false;
const dots=createRouteDots();scene.add(dots.mesh);
const highlight=new THREE.Mesh(new THREE.RingGeometry(1,1.07,64),new THREE.MeshBasicMaterial({color:0xffcd66,side:THREE.DoubleSide,depthTest:false}));highlight.rotation.x=-Math.PI/2;highlight.position.y=.21;highlight.renderOrder=5;highlight.visible=false;scene.add(highlight);
const gridPoints=[];for(let z=-38;z<40;z+=4)for(let x=-38;x<40;x+=4)gridPoints.push({x,z});
const gridMesh=new THREE.InstancedMesh(new THREE.CircleGeometry(.65,12),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.65,depthWrite:false,side:THREE.DoubleSide}),gridPoints.length);
const dummy=new THREE.Object3D();gridPoints.forEach((p,i)=>{dummy.position.set(p.x,.16,p.z);dummy.rotation.x=-Math.PI/2;dummy.updateMatrix();gridMesh.setMatrixAt(i,dummy.matrix);gridMesh.setColorAt(i,new THREE.Color(0xffffff));});gridMesh.visible=false;scene.add(gridMesh);
let view='orbit',tool='select',treeForm='broadleaf',cover='grass',selected=null,moving=null,viewingBaseline=false;
let history=[],dirty=true,metricsTimer=0,toastTimer=0,playing=false,lastSunAdvance=0,metrics={design:null,baseline:null},yaw=0,pitch=0,pointerDown=null;
const keys=new Set(),movement=new Set(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),ground=new THREE.Plane(new THREE.Vector3(0,1,0),0);
const temperatureLayer=createTemperatureLayer(scene,{
 markDirty:()=>markDirty(true),
 onWeatherChange:()=>{$('save-status').textContent='Unsaved weather settings';},
 onLayerChange:value=>{if(value){if(view==='walk')setView('top');setTab('temperature');tool='select';moving=null;all('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tool==='select'));gridMesh.visible=false;$('show-exposure').checked=false;renderer.domElement.style.cursor='crosshair';$('view-instruction').textContent='Click a cell to inspect its surface temperature';}else $('view-instruction').textContent=view==='top'?'Drag to pan · scroll to zoom · click to edit':'Drag to orbit · scroll to zoom · click to select';},
 onSelectCell:index=>{selected={kind:'tile',index};updateInspector();markDirty();}
});
const timeText=hour=>{const n=Math.round(hour*60);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');};
const percent=value=>value===null?'—':Math.round(value*100)+'%';
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function markDirty(shadow=false){dirty=true;if(shadow)renderer.shadowMap.needsUpdate=true;}
function remember(){history.push(deepCopy(design));if(history.length>30)history.shift();$('undo').disabled=false;}
function edited(){if(viewingBaseline)setBaselineView(false);currentLandscape.group.removeFromParent();currentLandscape.dispose();currentLandscape=createLandscape(design);scene.add(currentLandscape.group);$('tree-total').textContent=design.trees.length;$('save-status').textContent='Unsaved changes';if(selected?.kind==='tree'&&!design.trees.some(t=>t.id===selected.id))selected=null;updateInspector();markDirty(true);queueMetrics();}
function rebuildBaseline(){baselineLandscape.group.removeFromParent();baselineLandscape.dispose();baselineLandscape=createLandscape(baseline);scene.add(baselineLandscape.group);baselineLandscape.group.visible=viewingBaseline;markDirty(true);}
function queueMetrics(){clearTimeout(metricsTimer);metricsTimer=setTimeout(updateMetrics,90);}
function updateMetrics(){
 const position=sunPosition(sun);metrics.design=measureShade(currentLandscape,position,sun.dni);metrics.baseline=measureShade(baselineLandscape,position,sun.dni);
 const shown=viewingBaseline?metrics.baseline:metrics.design;
 $('route-shade').textContent=shown.shade===null?'Night':percent(shown.shade);$('route-meter-fill').style.width=(shown.shade||0)*100+'%';
 $('route-detail').textContent=shown.shade===null?'Sun below the horizon · direct beam 0 W/m²':Math.round(shown.beam)+' W/m² mean direct beam · 121 m route';
 $('baseline-shade').textContent=percent(metrics.baseline.shade);$('design-shade').textContent=percent(metrics.design.shade);
 $('baseline-beam').textContent=Math.round(metrics.baseline.beam)+' W/m²';$('design-beam').textContent=Math.round(metrics.design.beam)+' W/m²';
 $('baseline-trees').textContent=baseline.trees.length;$('design-trees').textContent=design.trees.length;
 if(shown.shade===null)$('comparison-result').textContent='The sun is below the horizon. Move the time slider to compare daytime shade.';
 else {const diff=Math.round((metrics.design.shade-metrics.baseline.shade)*100);$('comparison-result').textContent=diff>0?diff+' percentage points more route shade in your design at '+timeText(sun.hour)+'.':diff<0?Math.abs(diff)+' percentage points less route shade in your design at '+timeText(sun.hour)+'.':'The two layouts give the same route shade to the nearest percentage point at '+timeText(sun.hour)+'.';}
 dots.update(shown.flags);
 temperatureLayer.refresh({design,baseline,currentLandscape,baselineLandscape,sun,position,viewingBaseline});
 if(gridMesh.visible){const exposure=measureShade(viewingBaseline?baselineLandscape:currentLandscape,position,sun.dni,gridPoints);exposure.flags.forEach((f,i)=>gridMesh.setColorAt(i,new THREE.Color(f===null?0x8e9d99:f?0x408ac9:0xe7ab38)));gridMesh.instanceColor.needsUpdate=true;}
 markDirty();
}
function syncSunInputs(){$('sun-date').value=sun.date;$('utc-offset').value=sun.utcOffset;$('sun-strength').value=sun.dni;$('time-slider').value=sun.hour;}
function applySun(markUnsaved=true){
 if(markUnsaved)$('save-status').textContent='Unsaved sun settings';
 const p=sunPosition(sun);sunlight.position.set(p.x*140,p.y*140,p.z*140);sunlight.target.position.set(0,0,0);sunlight.intensity=p.y>0?3.1*sun.dni/800:0;
 skyLight.intensity=p.y>0?1.55:Math.max(.28,1.55+p.y*5);const sky=new THREE.Color(p.y>0?0xc2d9d9:0x748d9f);scene.background.copy(sky);scene.fog.color.copy(sky);
 $('time-label').textContent=timeText(sun.hour);$('time-slider').value=sun.hour;
 $('date-caption').textContent=new Date(sun.date+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',timeZone:'UTC'})+' · UTC+'+sun.utcOffset;
 $('sun-strength-value').textContent=sun.dni+' W/m²';$('sun-elevation').textContent=p.elevation.toFixed(1)+'°';$('sun-azimuth').textContent=Math.round(p.azimuth)+'°';
 markDirty(true);queueMetrics();
}
function setTab(name){all('[data-tab]').forEach(b=>{const active=b.dataset.tab===name;b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1;$('panel-'+b.dataset.tab).hidden=!active;});}
all('[data-tab]').forEach((b,i,buttons)=>{b.addEventListener('click',()=>setTab(b.dataset.tab));b.addEventListener('keydown',e=>{let n=i;if(e.key==='ArrowRight')n=(i+1)%buttons.length;else if(e.key==='ArrowLeft')n=(i+buttons.length-1)%buttons.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=buttons.length-1;else return;e.preventDefault();setTab(buttons[n].dataset.tab);buttons[n].focus();});});
function setTool(next){
 if(viewingBaseline)setBaselineView(false);if(view==='walk'&&next!=='select')setView('orbit');
 if(next!=='select'&&temperatureLayer.enabled)temperatureLayer.setVisible(false);tool=next;moving=null;all('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tool===tool));
 $('tool-hint').textContent=tool==='plant'?'Click dry ground to plant a '+TREE_FORMS[treeForm].label.toLowerCase()+'. Select it afterward to adjust its size.':tool==='paint'?'Click a tile to change its land cover. Water removes trees in that tile; Undo restores them.':'Select a tree or ground tile to inspect it. Drag the scene to orbit.';
 renderer.domElement.style.cursor=tool==='select'?'grab':'crosshair';
}
all('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
all('[data-tree]').forEach(b=>b.addEventListener('click',()=>{treeForm=b.dataset.tree;all('[data-tree]').forEach(c=>c.setAttribute('aria-pressed',c===b));setTool('plant');}));
all('[data-cover]').forEach(b=>b.addEventListener('click',()=>{cover=b.dataset.cover;all('[data-cover]').forEach(c=>c.setAttribute('aria-pressed',c===b));setTool('paint');}));
function updateInspector(){
 highlight.visible=false;const panel=$('selection-panel');
 if(viewingBaseline){panel.innerHTML='<span class="eyebrow">VIEWING BASELINE</span><p>Return to your design in Compare to inspect or edit trees.</p>';return;}
 if(!selected){panel.innerHTML='<span class="eyebrow">INSPECTOR</span><p>Select a tree to change its shape, move it, or remove it.</p>';return;}
 if(selected.kind==='tile'){
  const p=tileCenter(selected.index);highlight.position.set(p.x,.21,p.z);highlight.scale.set(3.8,3.8,1);highlight.visible=true;
  const title={grass:'Grass',crop:'Crops',soil:'Bare soil',paving:'Paving',water:'Water',forest:'Woodland'}[design.cover[selected.index]];
  panel.innerHTML='<span class="eyebrow">GROUND TILE '+(selected.index+1)+'</span><h3>'+title+'</h3><p>8 × 8 m · '+Math.abs(p.x)+' m '+(p.x<0?'west':'east')+', '+Math.abs(p.z)+' m '+(p.z<0?'north':'south')+'</p><p>Choose a land cover above, then click this tile to repaint it. Use the temperature layer for an illustrative energy-balance estimate.</p><button id="inspect-temperature" class="wide-button thermal-inspect-button">Inspect temperature</button>';$('inspect-temperature').addEventListener('click',()=>{temperatureLayer.inspect(selected.index);temperatureLayer.setVisible(true);});return;
 }
 const t=design.trees.find(t=>t.id===selected.id);if(!t){selected=null;updateInspector();return;}
 highlight.position.set(t.x,.21,t.z);highlight.scale.set(t.radius,t.radius,1);highlight.visible=!viewingBaseline;
 panel.innerHTML='<span class="eyebrow">SELECTED TREE</span><h3>'+TREE_FORMS[t.type].label+'</h3><label for="tree-form">Crown form</label><select id="tree-form">'+Object.entries(TREE_FORMS).map(([k,v])=>'<option value="'+k+'"'+(k===t.type?' selected':'')+'>'+v.label+'</option>').join('')+'</select><div class="range-label"><label for="tree-height">Height</label><output id="height-output">'+t.height.toFixed(1)+' m</output></div><input id="tree-height" type="range" min="3" max="24" step="0.5" value="'+t.height+'"><div class="range-label"><label for="tree-width">Crown width</label><output id="width-output">'+(t.radius*2).toFixed(1)+' m</output></div><input id="tree-width" type="range" min="1.6" max="14" step="0.2" value="'+(t.radius*2)+'"><div class="inspector-actions"><button id="move-tree">Move tree</button><button id="remove-tree" class="delete-button">Remove</button></div>';
 $('tree-form').addEventListener('change',e=>{remember();t.type=e.target.value;edited();});
 for(const [id,output,prop,factor] of [['tree-height','height-output','height',1],['tree-width','width-output','radius',.5]]){
  $(id).addEventListener('input',e=>$(output).textContent=Number(e.target.value).toFixed(1)+' m');
  $(id).addEventListener('change',e=>{const value=Number(e.target.value)*factor;if(t[prop]!==value){remember();t[prop]=value;edited();}});
 }
 $('move-tree').addEventListener('click',()=>{setTool('select');moving=t.id;renderer.domElement.style.cursor='crosshair';$('tool-hint').textContent='Click dry ground to move this tree. Press Escape to cancel.';toast('Choose a new position for this tree.');});
 $('remove-tree').addEventListener('click',()=>{remember();design.trees=design.trees.filter(tree=>tree.id!==t.id);selected=null;edited();toast('Tree removed. Undo can bring it back.');});
}
function setBaselineView(value){
 viewingBaseline=value;currentLandscape.group.visible=!value;baselineLandscape.group.visible=value;highlight.visible=!value&&!!selected;$('world-mode').textContent=value?'Saved baseline':'Your design';$('toggle-baseline').textContent=value?'Return to your design':'View baseline in 3D';$('toggle-baseline').setAttribute('aria-pressed',value);if(value){moving=null;toast('Viewing the baseline. Your design is kept.');}updateInspector();markDirty(true);updateMetrics();
}
$('capture-baseline').addEventListener('click',()=>{baseline=deepCopy(design);rebuildBaseline();updateMetrics();$('save-status').textContent='Unsaved baseline';toast('Baseline saved for this session. Export your design to keep both layouts.');});
$('toggle-baseline').addEventListener('click',()=>setBaselineView(!viewingBaseline));
$('undo').addEventListener('click',()=>{if(!history.length)return;design=history.pop();$('undo').disabled=history.length===0;selected=null;moving=null;edited();toast('Last landscape edit undone.');});
$('sun-date').addEventListener('change',e=>{if(e.target.checkValidity()&&e.target.value){sun.date=e.target.value;applySun();}else{e.target.value=sun.date;toast('Choose a date between 2020 and 2040.');}});
$('utc-offset').addEventListener('change',e=>{sun.utcOffset=Number(e.target.value);applySun();});
$('sun-strength').addEventListener('input',e=>{sun.dni=Number(e.target.value);applySun();});
$('time-slider').addEventListener('input',e=>{setPlaying(false);sun.hour=Number(e.target.value);applySun();});
$('show-exposure').addEventListener('change',e=>{gridMesh.visible=e.target.checked;queueMetrics();markDirty();});
function setPlaying(value){playing=value;lastSunAdvance=performance.now();$('play-sun').setAttribute('aria-pressed',value);$('play-sun').textContent=value?'Ⅱ':'▶';$('play-sun').setAttribute('aria-label',value?'Pause sun animation':'Animate sun through the day');}
$('play-sun').addEventListener('click',()=>setPlaying(!playing));
function setView(next){
 keys.clear();movement.clear();view=next;controls.enabled=next!=='walk';controls.enableRotate=next==='orbit';controls.mouseButtons.LEFT=next==='top'?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;controls.touches.ONE=next==='top'?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;controls.maxPolarAngle=next==='top'?.03:Math.PI*.47;
 all('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===view));$('walk-hint').hidden=next!=='walk';$('walk-pad').hidden=next!=='walk';
 if(next==='walk'){if(temperatureLayer.enabled)temperatureLayer.setVisible(false);yaw=-Math.PI/2;pitch=0;camera.position.set(-28,1.82,6);camera.rotation.order='YXZ';camera.rotation.set(pitch,yaw,0);$('view-instruction').textContent='W A S D to walk · drag to look · Esc to exit';renderer.domElement.style.cursor='grab';$('viewport').focus({preventScroll:true});}
 else {camera.up.set(0,1,0);camera.rotation.order='XYZ';const fit=Math.max(1,1.1/camera.aspect);camera.position.set(...(next==='top'?[0,158*fit,6.1]:[78*fit,72*fit,93*fit]));controls.target.set(0,2,next==='top'?6:0);controls.update();$('view-instruction').textContent=next==='top'?'Drag to pan · scroll to zoom · click to edit':'Drag to orbit · scroll to zoom · click to select';renderer.domElement.style.cursor=tool==='select'?'grab':'crosshair';}
 markDirty();
}
all('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));$('recenter').addEventListener('click',()=>setView(view));
const walkKeys=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift']);
window.addEventListener('keydown',e=>{
 if(e.key==='Escape'){if(moving){moving=null;setTool('select');toast('Tree move cancelled.');}else if(view==='walk')setView('orbit');return;}
 if(view!=='walk'||e.target.closest('input,select,button,dialog')||$('guide').open||$('reset-dialog').open)return;
 if(walkKeys.has(e.key.toLowerCase())){e.preventDefault();keys.add(e.key.toLowerCase());}
});window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();movement.clear();pointerDown=null;});
all('[data-move]').forEach(button=>{button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);movement.add(button.dataset.move);});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>movement.delete(button.dataset.move));});
function walkable(x,z){const index=tileIndex(x,z);const data=viewingBaseline?baseline:design;return Math.abs(x)<39&&Math.abs(z)<39&&!blockedByBuilding(x,z,.38)&&!(data.cover[index]==='water'&&!onRoute(x,z,.72))&&!data.trees.some(t=>Math.hypot(x-t.x,z-t.z)<.45+t.height*.025);}
function moveWalker(dt){
 if($('guide').open||$('reset-dialog').open)return;
 let forward=(keys.has('w')||keys.has('arrowup')||movement.has('forward')?1:0)-(keys.has('s')||keys.has('arrowdown')||movement.has('back')?1:0),right=(keys.has('d')||keys.has('arrowright')||movement.has('right')?1:0)-(keys.has('a')||keys.has('arrowleft')||movement.has('left')?1:0);
 const length=Math.hypot(forward,right);if(!length)return;const speed=(keys.has('shift')?7:3.5)*dt/length;forward*=speed;right*=speed;
 const dx=-Math.sin(yaw)*forward+Math.cos(yaw)*right,dz=-Math.cos(yaw)*forward-Math.sin(yaw)*right;
 if(walkable(camera.position.x+dx,camera.position.z))camera.position.x+=dx;if(walkable(camera.position.x,camera.position.z+dz))camera.position.z+=dz;markDirty();
}
renderer.domElement.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointerDown={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,id:e.pointerId,moved:false};if(view==='walk')renderer.domElement.setPointerCapture(e.pointerId);});
renderer.domElement.addEventListener('pointermove',e=>{if(!pointerDown||pointerDown.id!==e.pointerId)return;const p=pointerDown;if(Math.hypot(e.clientX-p.x,e.clientY-p.y)>5)p.moved=true;if(view==='walk'){yaw-=(e.clientX-p.lastX)*.004;pitch=Math.max(-1.25,Math.min(1.25,pitch-(e.clientY-p.lastY)*.004));camera.rotation.set(pitch,yaw,0,'YXZ');markDirty();}p.lastX=e.clientX;p.lastY=e.clientY;});
renderer.domElement.addEventListener('pointercancel',()=>pointerDown=null);
renderer.domElement.addEventListener('pointerup',e=>{if(!pointerDown||pointerDown.id!==e.pointerId)return;const p=pointerDown;pointerDown=null;if(!p.moved&&e.button===0)handleSceneClick(e);});
function handleSceneClick(e){
 if(viewingBaseline&&!temperatureLayer.enabled){toast('Return to your design in Compare to make edits.');return;}
 if(view==='walk'){toast('Use Orbit or Aerial to edit the landscape.');return;}
 const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
 if(temperatureLayer.enabled){const p=new THREE.Vector3();if(raycaster.ray.intersectPlane(ground,p)){const index=tileIndex(p.x,p.z);if(index>=0){selected={kind:'tile',index};temperatureLayer.inspect(index);updateInspector();markDirty();}}return;}
 if(tool==='select'&&!moving){
  const hit=raycaster.intersectObjects(currentLandscape.pickables,false)[0];
  if(!hit)selected=null;
  else if(hit.object.userData.kind==='building'){toast('Village buildings are fixed in this first landscape. Try a tree or a ground tile.');return;}
  else selected={...hit.object.userData};
  updateInspector();markDirty();return;
 }
 const point=new THREE.Vector3();if(!raycaster.ray.intersectPlane(ground,point)||tileIndex(point.x,point.z)<0)return;
 if(moving){const before=deepCopy(design),result=moveTree(design,moving,point.x,point.z);if(result.error){toast(result.error);return;}history.push(before);if(history.length>30)history.shift();$('undo').disabled=false;moving=null;setTool('select');edited();toast('Tree moved. Watch its shadow and the route score.');return;}
 if(tool==='plant'){
  const before=deepCopy(design),result=plantTree(design,point.x,point.z,treeForm);if(result.error){toast(result.error);return;}history.push(before);if(history.length>30)history.shift();$('undo').disabled=false;selected={kind:'tree',id:result.tree.id};edited();toast(TREE_FORMS[treeForm].label+' planted. Use Select to edit it.');
 }else if(tool==='paint'){
  const before=deepCopy(design),index=tileIndex(point.x,point.z),result=paintCover(design,index,cover);if(result.error){toast(result.error);return;}if(!result.changed){toast('This tile already has that land cover.');return;}history.push(before);if(history.length>30)history.shift();$('undo').disabled=false;selected={kind:'tile',index};edited();if(result.removed)toast('Water added; '+result.removed+' tree'+(result.removed>1?'s':'')+' removed. Undo restores them.');else if(cover==='forest')toast('Woodland added with '+result.added+' new trees where space allowed.');
 }
}
$('save-design').addEventListener('click',()=>{
 const blob=new Blob([scenarioJSON(design,baseline,sun,temperatureLayer.weather)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Landscape_Climate_Lab_Design_'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);$('save-status').textContent='Design exported';toast('Design, baseline, sun, and weather settings exported. Use Load to return to them.');
});
$('load-design').addEventListener('click',()=>$('design-file').click());
$('design-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>250000)throw new Error('Choose a design file smaller than 250 KB.');const loaded=parseScenario(await file.text());setPlaying(false);design=loaded.design;baseline=loaded.baseline;sun=loaded.sun;temperatureLayer.load(loaded.thermal);history=[];selected=null;moving=null;viewingBaseline=false;$('undo').disabled=true;rebuildBaseline();edited();setBaselineView(false);syncSunInputs();applySun();setView('orbit');$('save-status').textContent='Saved design loaded';toast('Your design, baseline, sunlight, and weather are restored.');}catch(error){toast(error.message||'This design file could not be loaded.');}e.target.value='';});
$('reset-scene').addEventListener('click',()=>{setPlaying(false);$('reset-dialog').showModal();});$('cancel-reset').addEventListener('click',()=>$('reset-dialog').close());
$('confirm-reset').addEventListener('click',()=>{design=initialDesign();baseline=deepCopy(design);sun=initialSun();temperatureLayer.load(initialThermal());history=[];selected=null;moving=null;viewingBaseline=false;$('undo').disabled=true;rebuildBaseline();edited();setBaselineView(false);syncSunInputs();applySun();setTool('select');setView('orbit');$('save-status').textContent='Export a design to keep it';$('reset-dialog').close();toast('Original landscape restored.');});
$('guide').innerHTML='<button class="guide-close" aria-label="Close field guide">×</button><span class="eyebrow">LANDSCAPE CLIMATE LAB · FIELD GUIDE</span><h2 id="guide-title">A place to ask “what if?”</h2><p>Start by planting a broadleaf tree beside the walking route. Move the sun, then walk underneath its crown. Use Compare to see how your layout changes the shade.</p><div class="guide-grid"><article><h3>Explore the landscape</h3><p><b>Orbit:</b> drag to rotate, scroll to zoom, right-drag to pan.<br><b>Aerial:</b> drag to pan, scroll to zoom.<br><b>Walk:</b> W A S D or arrows to move, drag to look, Escape to leave. Hold Shift to move faster.</p></article><article><h3>Make a design</h3><p>Choose a tree or land cover, then click the ground. Use Select to resize, reshape, move, or remove a tree. Undo restores your last landscape edit. Save design exports both layouts, sun settings, and temperature assumptions as a JSON file.</p></article></div><h3>What is measured?</h3><p>The 121 m route is sampled about every 0.8 m. A ray from each sample toward the sun tests the same solid tree, building, and bench shapes used in the scene. Shade is the length-weighted fraction blocked from the sun. The route includes a boardwalk over the pond.</p><p>Mean direct beam = direct normal irradiance × sine of sun elevation × unshaded route fraction, in W/m². This is direct beam onto the horizontal route surface. Diffuse sky radiation and reflected light are not included. After sunset, beam is zero and shade is not scored.</p><h3>What is outside this model?</h3><p>These are stylized, opaque crowns, not species-specific leaf canopies. Leaf gaps and seasonal leaf loss are not modeled. The temperature layer adds an illustrative surface energy balance with assumed weather and material properties. It does not predict air cooling, human thermal comfort, or canopy temperature. The exposure grid uses point samples at 4 m spacing. Soft rendered shadow edges can differ slightly from the binary ray measurements.</p><h3>Surface temperature, not observed LST</h3><p>The temperature map solves an equilibrium surface energy balance for sunlit and shaded ground, then averages their temperatures using up to 16 sample points per 8 × 8 m cell. Building footprints and boardwalks are excluded. Forest values describe the forest floor; crops describe an idealized ground layer. Tree crowns are hidden in the temperature view so you can read the ground, but their shade is retained in the calculation. This spatial average is not a satellite radiometric LST retrieval.</p><p>Absorbed shortwave + net longwave = sensible heat + latent heat + exchange with a lower reservoir. The map uses your air temperature, wind, relative humidity and evaporation availability, plus assumed cover properties. Fixed assumptions: daytime diffuse light 100 W/m², sky emissivity 0.85, lower reservoir 3 °C below air, and sensible exchange coefficient 5 + 4 × wind speed W/m²/K. These demonstration coefficients are not field-calibrated.</p><p>No heat capacity, thermal history, reflected radiation, canopy longwave exchange, or obstructed diffuse sky is modeled. Nighttime estimates are unavailable. In particular, water heat storage and nighttime warming require a different model. The same fixed 15–60 °C color scale is used for the baseline and your design; temperatures outside it use the endpoint colors. Energy-balance concepts follow <a href="https://escomp.github.io/CTSM/release-clm5.0/tech_note/Fluxes/CLM50_Tech_Note_Fluxes.html" target="_blank" rel="noopener noreferrer">CLM surface-flux documentation</a> and <a href="https://www.fao.org/4/x0490e/x0490e06.htm" target="_blank" rel="noopener noreferrer">FAO reference-surface methods</a>; this simplified demonstration is not either model.</p><h3>Sun and location</h3><p>The fictional 80 × 80 m site uses Berlin coordinates, 52.52° N, 13.405° E. Sun position follows the <a href="https://gml.noaa.gov/grad/solcalc/solareqns.PDF" target="_blank" rel="noopener noreferrer">NOAA approximate solar equations</a>, with geometric elevation and no atmospheric refraction. Set UTC+2 for a summer clock or UTC+1 for a winter clock; the offset is manual. Trees keep their crowns across all dates.</p><h3>Keep your work</h3><p>Your edits stay in this browser tab until you leave or reset. Export a design to keep it, then use Load here to restore it. The design file contains the layout; it is not a standalone copy of the app.</p><p>The compatibility view supports browsers without WebGL using SVG geometry. It has simplified lighting and no rendered shadows, while shade rays and temperature calculations are unchanged.</p><p>Built with <a href="https://threejs.org/" target="_blank" rel="noopener noreferrer">Three.js</a>. No Blender or 3D editor is required.</p><div class="dialog-buttons"><button class="gold-button guide-done">Start exploring</button></div>';
function openGuide(){setPlaying(false);keys.clear();movement.clear();$('guide').showModal();}for(const id of ['help','model-notes','thermal-notes'])$(id).addEventListener('click',openGuide);all('.guide-close,.guide-done').forEach(b=>b.addEventListener('click',()=>$('guide').close()));
$('guide').addEventListener('click',e=>{if(e.target===$('guide')){const r=$('guide').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('guide').close();}});
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();setPlaying(false);$('loading').hidden=false;$('loading').classList.add('error');$('loading').innerHTML='<h2>The 3D view paused</h2><p>Your layout is still available. Save your design, then reload this page to restore the graphics.</p>';});
renderer.domElement.addEventListener('webglcontextrestored',()=>{$('loading').hidden=true;markDirty(true);});
function resize(){const rect=$('viewport').getBoundingClientRect();if(!rect.width||!rect.height)return;camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();renderer.setSize(rect.width,rect.height);markDirty(true);}new ResizeObserver(resize).observe($('viewport'));
let lastFrame=performance.now();function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-lastFrame)/1000,.05);lastFrame=now;if(document.hidden)return;
 if(view==='walk')moveWalker(dt);else if(controls.update())dirty=true;
 if(playing&&now-lastSunAdvance>350){sun.hour=Math.round((sun.hour+.25)*1000)/1000;if(sun.hour>21)sun.hour=5;lastSunAdvance=now;applySun();}
 if(dirty){const direction=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);const heading=Math.atan2(direction.x,-direction.z);document.querySelector('.north-marker span').style.transform='rotate('+(-heading)+'rad)';temperatureLayer.render(camera,renderer.domElement.clientWidth,renderer.domElement.clientHeight,view);renderer.render(scene,camera);dirty=false;}
}
controls.addEventListener('change',()=>markDirty());
$('tree-total').textContent=design.trees.length;syncSunInputs();applySun(false);resize();setView('orbit');controls.update();updateMetrics();renderer.render(scene,camera);$('loading').hidden=true;requestAnimationFrame(frame);
