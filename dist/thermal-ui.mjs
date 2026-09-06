import * as THREE from './vendor/three.module.min.js';
import {tileCenter} from './model.mjs';
import {measureShade} from './scene.mjs';
import {initialThermal,validateThermal,thermalSamplePoints,calculateTemperatures,thermalColor,SURFACES} from './thermal.mjs';

export function createTemperatureLayer(scene,callbacks){
 const $=id=>document.getElementById(id),sampling=thermalSamplePoints();
 let enabled=false,weather=initialThermal(),inputs=null,results=null,selectedCell=null,lastView='orbit';
 const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(7.92,7.92),new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,toneMapped:false}),100),dummy=new THREE.Object3D();
 for(let i=0;i<100;i++){const p=tileCenter(i);dummy.position.set(p.x,.022,p.z);dummy.rotation.x=-Math.PI/2;dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new THREE.Color('#879498'));}
 mesh.visible=false;scene.add(mesh);
 const labels=Array.from({length:100},(_,i)=>{const el=document.createElement('span');el.className='cell-value';el.dataset.cell=i;el.textContent='—';$('cell-labels').append(el);const p=tileCenter(i);return {el,position:new THREE.Vector3(p.x,.5,p.z)};});
 for(let i=0;i<100;i++){const option=document.createElement('option');option.value=i;option.textContent='Cell '+String(i+1).padStart(2,'0')+' · row '+(Math.floor(i/10)+1)+', column '+(i%10+1);$('thermal-cell').append(option);}
 const fields=[['air-temperature','airTemperature',1,' °C'],['thermal-wind','wind',1,' m/s'],['thermal-humidity','humidity',1,'%'],['thermal-moisture','moisture',.01,'%']];
 function syncWeather(){for(const [id,key,factor,unit] of fields){$(id).value=weather[key]/factor;$(id+'-value').textContent=(key==='wind'?weather[key].toFixed(1):Math.round(weather[key]/factor))+unit;}}
 for(const [id,key,factor] of fields)$(id).addEventListener('input',()=>{weather[key]=Number($(id).value)*factor;syncWeather();callbacks.onWeatherChange();if(inputs)refresh(inputs);});
 function setCanopies(){if(!inputs)return;for(const l of [inputs.currentLandscape,inputs.baselineLandscape])for(const g of l.treeGroups.values())g.visible=!enabled;}
 function setVisible(value){enabled=value;mesh.visible=value;$('thermal-legend').hidden=!value;$('toggle-thermal').setAttribute('aria-pressed',value);$('toggle-thermal').textContent=value?'Return to natural view':'Show temperature map';document.querySelectorAll('[data-layer]').forEach(b=>b.setAttribute('aria-pressed',(b.dataset.layer==='temperature')===value));$('cell-labels').hidden=!value||lastView!=='top'||!$('show-cell-values').checked;callbacks.onLayerChange(value);setCanopies();if(inputs)refresh(inputs);callbacks.markDirty();}
 $('toggle-thermal').addEventListener('click',()=>setVisible(!enabled));document.querySelectorAll('[data-layer]').forEach(b=>b.addEventListener('click',()=>setVisible(b.dataset.layer==='temperature')));
 $('show-cell-values').addEventListener('change',()=>{updateLabelVisibility();callbacks.markDirty();});
 $('thermal-cell').addEventListener('change',()=>{if($('thermal-cell').value!==''){inspect(Number($('thermal-cell').value));callbacks.onSelectCell(selectedCell);}});
 function inspect(index){selectedCell=index;$('thermal-cell').value=index??'';if(inputs)refresh(inputs);}
 function updateInspector(){
  if(selectedCell===null)return;const shown=inputs.viewingBaseline?results.baseline:results.design,c=shown.cells[selectedCell],other=results.baseline.cells[selectedCell];
  const diff=results.design.cells[selectedCell].temperature===null||other.temperature===null?null:results.design.cells[selectedCell].temperature-other.temperature;
  const title=SURFACES[c.cover].label;
  if(c.temperature===null){$('thermal-inspector').innerHTML='<span class="eyebrow">CELL '+(selectedCell+1)+' · '+title+'</span><h3>No estimate</h3><p>'+c.reason+'.</p>';return;}
  const comparison=diff===null?'No baseline estimate':(diff>0?'+':'')+diff.toFixed(1)+' °C design minus baseline';
  $('thermal-inspector').innerHTML='<span class="eyebrow">CELL '+(selectedCell+1)+' · '+title+'</span><div class="cell-temperature">'+c.temperature.toFixed(1)+'<span> °C</span></div><p class="estimate-label">Simulated ground / water surface</p><dl><div><dt>Geometric shade</dt><dd>'+Math.round(c.shade*100)+'%</dd></div><div><dt>Valid samples</dt><dd>'+c.samples+' / 16</dd></div><div><dt>Air temperature</dt><dd>'+weather.airTemperature+' °C</dd></div><div><dt>Baseline cell</dt><dd>'+(other.temperature===null?'—':other.temperature.toFixed(1)+' °C')+'</dd></div></dl><p class="cell-delta">'+comparison+'</p><p class="hint">'+c.samples+' ground samples. Roofs and boardwalks are excluded. Temperature is a spatial mean of sunlit and shaded equilibria.</p>';
 }
 function refresh(next){
  inputs=next;setCanopies();if(!enabled&&selectedCell===null)return;
  const calc=(design,landscape)=>{const shade=measureShade(landscape,next.position,next.sun.dni,sampling.points);return calculateTemperatures(design,next.position,next.sun.dni,weather,shade.flags,sampling);};
  results={design:calc(next.design,next.currentLandscape),baseline:calc(next.baseline,next.baselineLandscape)};
  const shown=next.viewingBaseline?results.baseline:results.design;
  for(const c of shown.cells){mesh.setColorAt(c.index,new THREE.Color(thermalColor(c.temperature)));labels[c.index].el.textContent=c.temperature===null?'—':Math.round(c.temperature)+'°';labels[c.index].el.classList.toggle('is-selected',c.index===selectedCell);}
  mesh.instanceColor.needsUpdate=true;
  $('thermal-range').textContent=shown.night?'Sun below horizon · no temperature estimate':shown.min===null?'No cells within model scope':'Cells '+shown.min.toFixed(1)+' to '+shown.max.toFixed(1)+' °C · ground surfaces';
  updateInspector();callbacks.markDirty();
 }
 function updateLabelVisibility(){$('cell-labels').hidden=!enabled||lastView!=='top'||!$('show-cell-values').checked;}
 function render(camera,width,height,view){lastView=view;updateLabelVisibility();if($('cell-labels').hidden)return;for(const l of labels){const p=l.position.clone().project(camera);l.el.hidden=p.z<-1||p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1;l.el.style.transform='translate(-50%,-50%) translate('+((p.x+1)*width/2)+'px,'+((-p.y+1)*height/2)+'px)';}}
 syncWeather();
 return {refresh,inspect,setVisible,render,get enabled(){return enabled;},get weather(){return {...weather};},load(value){weather=validateThermal(value);selectedCell=null;$('thermal-cell').value='';$('thermal-inspector').innerHTML='<p>Click any ground cell to inspect its temperature.</p>';syncWeather();results=null;},clearSelection(){selectedCell=null;$('thermal-cell').value='';$('thermal-inspector').innerHTML='<p>Click any ground cell to inspect its temperature.</p>';}};
}
