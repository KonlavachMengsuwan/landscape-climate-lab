import test from 'node:test';
import assert from 'node:assert/strict';
import {initialDesign,initialSun,sunPosition,deepCopy,parseScenario,scenarioJSON,validateDesign} from '../dist/model.mjs';
import {equilibriumTemperature,energyBalance,SURFACES,initialThermal,thermalSamplePoints,calculateTemperatures} from '../dist/thermal.mjs';
import {createLandscape,measureShade} from '../dist/scene.mjs';
import {plantTree,paintCover} from '../dist/actions.mjs';
const weather=initialThermal();
test('every preset has a closed energy balance under representative forcing',()=>{
 for(const cover of Object.keys(SURFACES))for(const forcing of [0,100,800,1100]){const out=equilibriumTemperature(cover,forcing,weather);assert.ok(out);assert.ok(Math.abs(out.residual)<.01);assert.ok(out.temperature>-40&&out.temperature<95);}
});
test('more absorbed sun warms a surface; evaporation and wind change the appropriate fluxes',()=>{
 const sun=equilibriumTemperature('soil',800,weather),shade=equilibriumTemperature('soil',100,weather);assert.ok(sun.temperature>shade.temperature);
 const wet=equilibriumTemperature('grass',800,{...weather,moisture:1}),dry=equilibriumTemperature('grass',800,{...weather,moisture:0});assert.ok(wet.temperature<dry.temperature);
 assert.equal(equilibriumTemperature('water',800,{...weather,moisture:0}).temperature,equilibriumTemperature('water',800,{...weather,moisture:1}).temperature);
 assert.equal(equilibriumTemperature('paving',800,{...weather,moisture:0}).temperature,equilibriumTemperature('paving',800,{...weather,moisture:1}).temperature);
 const still=equilibriumTemperature('paving',800,{...weather,wind:.2}),windy=equilibriumTemperature('paving',800,{...weather,wind:8});assert.ok(windy.temperature<still.temperature);
 const lighter={...SURFACES.paving,albedo:.6};assert.ok(energyBalance(still.temperature,lighter,800,{...weather,wind:.2}).residual<0);
});
test('grid values average separate sunlit/shaded equilibria and masked area is explicit',()=>{
 const d=initialDesign(),sun=initialSun(),p=sunPosition(sun),samples=thermalSamplePoints(),lit=samples.points.map(()=>false),shade=samples.points.map(()=>true);
 const a=calculateTemperatures(d,p,sun.dni,weather,lit,samples),b=calculateTemperatures(d,p,sun.dni,weather,shade,samples);
 for(let i=0;i<100;i++){if(a.cells[i].temperature!==null){assert.ok(a.cells[i].temperature>b.cells[i].temperature);assert.equal(a.cells[i].coverage,samples.cells[i].length/16);assert.equal(a.cells[i].temperature,a.cells[i].sunlitTemperature);assert.equal(b.cells[i].temperature,b.cells[i].shadedTemperature);}}
 assert.ok(samples.points.length<1600);assert.ok(a.cells.some(c=>c.coverage<1));
 const night=calculateTemperatures(d,{x:0,y:-1,z:0},800,weather,shade,samples);assert.ok(night.cells.every(c=>c.temperature===null));assert.equal(night.mean,null);
});
test('legacy designs load with defaults; v2 preserves weather and refuses invalid weather',()=>{
 const design=initialDesign(),baseline=deepCopy(design),sun=initialSun(),w={airTemperature:35,wind:4,humidity:70,moisture:.2};
 const legacy=JSON.stringify({format:'landscape-climate-lab',version:1,design,baseline,sun});assert.deepEqual(parseScenario(legacy).thermal,weather);
 const saved=parseScenario(scenarioJSON(design,baseline,sun,w));assert.deepEqual(saved,{design,baseline,sun,thermal:w});
 assert.throws(()=>parseScenario(scenarioJSON(design,baseline,sun,{...w,wind:-1})));
});
test('a new tree changes actual ground ray temperatures without changing the baseline',()=>{
 const d=initialDesign(),base=deepCopy(d),sun=initialSun(),p=sunPosition(sun),sampling=thermalSamplePoints();
 const l=createLandscape(d);const before=calculateTemperatures(d,p,800,weather,measureShade(l,p,800,sampling.points).flags,sampling);
 assert.ok(plantTree(d,0,0,'broadleaf').tree);const changed=createLandscape(d);const after=calculateTemperatures(d,p,800,weather,measureShade(changed,p,800,sampling.points).flags,sampling);
 assert.ok(after.cells.some((c,i)=>c.temperature!==null&&c.temperature<before.cells[i].temperature-.1));assert.equal(base.trees.length,27);
 l.dispose();changed.dispose();
});
test('all woodland and water edits remain valid saved designs',()=>{
 for(let i=0;i<100;i++)for(const cover of ['forest','water']){const d=initialDesign();if(!paintCover(d,i,cover).error)validateDesign(d);}
 assert.ok(plantTree(initialDesign(),15.999,30,'young').error);
});
test('freezing is unavailable and an unused shaded solution does not invalidate sunlit water',()=>{
 const cold={airTemperature:5,wind:8,humidity:10,moisture:0};assert.equal(equilibriumTemperature('water',100,cold),null);
 const d=initialDesign();d.cover.fill('water');const s=thermalSamplePoints(),p={x:0,y:1,z:0};
 const lit=calculateTemperatures(d,p,1000,cold,s.points.map(()=>false),s);assert.ok(lit.cells.some(c=>c.temperature!==null));
 const shade=calculateTemperatures(d,p,1000,cold,s.points.map(()=>true),s);assert.ok(shade.cells.every(c=>c.temperature===null));
});
