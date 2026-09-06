import {tileCenter,blockedByBuilding,onRoute} from './model.mjs';

export const SIGMA=5.670374419e-8;
export const THERMAL_SCALE={min:15,max:60};
// These are deliberately assumed scenario presets, not measured material data.
export const SURFACES={
 grass:{label:'Grass surface',albedo:.23,emissivity:.97,evaporation:.75,resistance:70,conductance:6},
 crop:{label:'Crop ground layer',albedo:.20,emissivity:.97,evaporation:.75,resistance:90,conductance:6},
 soil:{label:'Bare soil',albedo:.18,emissivity:.95,evaporation:.25,resistance:0,conductance:8},
 paving:{label:'Paving',albedo:.16,emissivity:.94,evaporation:0,resistance:0,conductance:12},
 water:{label:'Water surface',albedo:.08,emissivity:.98,evaporation:1,resistance:0,conductance:15},
 forest:{label:'Forest floor',albedo:.15,emissivity:.97,evaporation:.60,resistance:120,conductance:6}
};
export {initialThermal,validateThermal} from './model.mjs';
export function specificHumidity(temperature,relativeHumidity=100){
 const vapour=610.8*Math.exp(17.27*temperature/(temperature+237.3))*relativeHumidity/100;
 return .622*vapour/(101325-.378*vapour);
}
export function energyBalance(temperature,surface,forcing,weather){
 const ta=weather.airTemperature,tk=temperature+273.15,tak=ta+273.15;
 const h=5+4*weather.wind,airResistance=1.225*1005/h;
 const beta=surface===SURFACES.water?1:surface.evaporation*weather.moisture;
 const shortwave=(1-surface.albedo)*forcing;
 const longwave=surface.emissivity*(.85*SIGMA*tak**4-SIGMA*tk**4);
 const sensible=h*(temperature-ta);
 const latent=beta*1.225*2.45e6*(specificHumidity(temperature)-specificHumidity(ta,weather.humidity))/(airResistance+surface.resistance);
 const ground=surface.conductance*(temperature-(ta-3));
 return {shortwave,longwave,sensible,latent,ground,residual:shortwave+longwave-sensible-latent-ground};
}
export function equilibriumTemperature(cover,forcing,weather){
 const surface=SURFACES[cover];if(!surface||!Number.isFinite(forcing)||forcing<0)return null;
 let low=-40,high=95;const flo=energyBalance(low,surface,forcing,weather).residual,fhi=energyBalance(high,surface,forcing,weather).residual;
 if(!Number.isFinite(flo)||!Number.isFinite(fhi)||flo<0||fhi>0)return null;
 for(let i=0;i<45;i++){const mid=(low+high)/2;if(energyBalance(mid,surface,forcing,weather).residual>0)low=mid;else high=mid;}
 const temperature=(low+high)/2;if(cover==='water'&&temperature<0)return null;
 return {temperature,...energyBalance(temperature,surface,forcing,weather)};
}
export function thermalSamplePoints(){
 const points=[];const cells=Array.from({length:100},()=>[]);
 for(let i=0;i<100;i++){const p=tileCenter(i);for(const [ix,dx] of [-3,-1,1,3].entries())for(const [iz,dz] of [-3,-1,1,3].entries()){
  const x=p.x+dx+(iz%2?.3:-.3),z=p.z+dz+(ix%2?.3:-.3);
  if(blockedByBuilding(x,z,0)||onRoute(x,z,.83))continue;
  cells[i].push(points.length);points.push({x,y:.03,z,weight:1});
 }}return {points,cells};
}
export function calculateTemperatures(design,position,dni,weather,flags,sampling=thermalSamplePoints()){
 if(position.y<=0)return {night:true,cells:design.cover.map((cover,index)=>({index,cover,temperature:null,reason:'No daytime estimate',coverage:sampling.cells[index].length/16})),mean:null,min:null,max:null};
 const direct=dni*position.y,diffuse=100; // Fixed synthetic daytime diffuse irradiance, W/m².
 const solved=Object.fromEntries(Object.keys(SURFACES).map(cover=>[cover,{lit:equilibriumTemperature(cover,direct+diffuse,weather),shaded:equilibriumTemperature(cover,diffuse,weather)}]));
 const cells=design.cover.map((cover,index)=>{
  const indices=sampling.cells[index],solution=solved[cover];
  if(!indices.length)return {index,cover,temperature:null,reason:'Covered by buildings / route',coverage:0,samples:0};
  const shadedCount=indices.reduce((n,i)=>n+(flags[i]?1:0),0),shade=shadedCount/indices.length;
  if((shade<1&&!solution.lit)||(shade>0&&!solution.shaded))return {index,cover,temperature:null,reason:cover==='water'?'Freezing outside model scope':'Outside model range',coverage:indices.length/16,samples:indices.length};
  return {index,cover,temperature:(shade===1?0:solution.lit.temperature*(1-shade))+(shade===0?0:solution.shaded.temperature*shade),shade,coverage:indices.length/16,samples:indices.length,sunlitTemperature:solution.lit?.temperature??null,shadedTemperature:solution.shaded?.temperature??null,direct:direct*(1-shade),diffuse};
 });
 const valid=cells.filter(c=>c.temperature!==null),area=valid.reduce((n,c)=>n+c.samples,0);
 return {night:false,cells,mean:area?valid.reduce((n,c)=>n+c.temperature*c.samples,0)/area:null,min:valid.length?Math.min(...valid.map(c=>c.temperature)):null,max:valid.length?Math.max(...valid.map(c=>c.temperature)):null};
}
export function thermalColor(temperature){
 if(temperature===null)return '#879498';
 const stops=[[15,[53,92,159]],[25,[66,183,166]],[35,[243,228,146]],[45,[237,150,81]],[60,[185,59,61]]];
 const t=Math.max(15,Math.min(60,temperature));let i=0;while(i<stops.length-2&&t>stops[i+1][0])i++;
 const a=stops[i],b=stops[i+1],f=(t-a[0])/(b[0]-a[0]);return '#'+a[1].map((v,k)=>Math.round(v+(b[1][k]-v)*f).toString(16).padStart(2,'0')).join('');
}
