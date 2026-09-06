export const GRID=10, TILE=8, SIZE=80;
export const COVERS=['grass','crop','soil','paving','water','forest'];
export const TREE_FORMS={broadleaf:{label:'Broadleaf',height:11,radius:3.8},conifer:{label:'Conifer',height:14,radius:2.8},young:{label:'Young tree',height:5,radius:1.5}};
export const BUILDINGS=[{x:12,z:-25,w:7,d:7,h:6,roof:2.8,color:0xe7d4b3},{x:24,z:-26,w:6,d:8,h:8,roof:2.5,color:0xe6e1c9},{x:30,z:-12,w:7,d:6,h:5,roof:2.3,color:0xcba67e},{x:15,z:-11,w:6,d:6,h:5.8,roof:2.3,color:0xf0dec1},{x:4,z:-30,w:5,d:6,h:5,roof:2,color:0xdcc8a4}];
export const ROUTE=[[-29,6],[-12,6],[6,6],[26,6],[26,22],[8,22],[-8,22],[-8,6]];
export function tileCenter(i){return {x:(i%GRID)*TILE-SIZE/2+TILE/2,z:Math.floor(i/GRID)*TILE-SIZE/2+TILE/2};}
export function tileIndex(x,z){if(x<-40||x>=40||z<-40||z>=40)return -1;return Math.floor((z+40)/8)*10+Math.floor((x+40)/8);}
export function deepCopy(v){return JSON.parse(JSON.stringify(v));}
export function initialDesign(){
 const cover=Array.from({length:100},(_,i)=>{const p=tileCenter(i);if(p.x>12&&p.z>12&&p.x<36&&p.z<36)return 'water';if(p.x<-8&&p.z>8)return 'crop';if(p.x>0&&p.z<-4)return 'paving';if(p.x<-12&&p.z<-8)return 'forest';return 'grass';});
 const trees=[];
 function tree(x,z,type='broadleaf',height=null,radius=null){trees.push({id:'t-'+trees.length,type,x,z,height:height||TREE_FORMS[type].height,radius:radius||TREE_FORMS[type].radius});}
 for(let row=0;row<4;row++)for(let col=0;col<4;col++){const n=row*4+col;tree(-33+col*6.3+(row%2)*1.1,-32+row*6.7,n%4===0?'conifer':'broadleaf',n%4===0?14+n%3:10+n%4,n%4===0?2.6:3.2+n%3*.25);}
 [[-25,1],[-15,2],[-2,11],[12,11],[29,2],[8,27],[-14,29],[-31,26],[-31,14]].forEach((p,i)=>tree(p[0],p[1],i===6?'young':'broadleaf',i===6?5:10+(i%3),i===6?1.5:3.5));
 tree(34,-29,'conifer');tree(35,0,'young');
 return {cover,trees};
}
export function initialSun(){return {date:'2026-06-21',hour:15,utcOffset:2,dni:800};}
export function sunPosition(settings,latitude=52.52,longitude=13.405){
 const [year,month,day]=settings.date.split('-').map(Number);
 const utc=new Date(Date.UTC(year,month-1,day)+settings.hour*3600000-settings.utcOffset*3600000);
 const y=utc.getUTCFullYear(),N=Math.floor((Date.UTC(y,utc.getUTCMonth(),utc.getUTCDate())-Date.UTC(y,0,1))/86400000)+1;
 const D=(Date.UTC(y+1,0,1)-Date.UTC(y,0,1))/86400000,h=utc.getUTCHours()+utc.getUTCMinutes()/60+utc.getUTCSeconds()/3600;
 const g=2*Math.PI/D*(N-1+(h-12)/24),c=Math.cos,s=Math.sin;
 const e=229.18*(.000075+.001868*c(g)-.032077*s(g)-.014615*c(2*g)-.040849*s(2*g));
 const d=.006918-.399912*c(g)+.070257*s(g)-.006758*c(2*g)+.000907*s(2*g)-.002697*c(3*g)+.001480*s(3*g);
 const mod=(n,m)=>(n%m+m)%m,H=mod(h*60+4*longitude+e,1440)/4*Math.PI/180-Math.PI,p=latitude*Math.PI/180;
 const x=-c(d)*s(H),up=s(p)*s(d)+c(p)*c(d)*c(H),z=s(p)*c(d)*c(H)-c(p)*s(d);
 const len=Math.hypot(x,up,z);
 return {x:x/len,y:up/len,z:z/len,elevation:Math.asin(Math.max(-1,Math.min(1,up/len)))*180/Math.PI,azimuth:mod(Math.atan2(x,-z)*180/Math.PI,360)};
}
export function routeSamples(spacing=1){
 if(!Number.isFinite(spacing)||spacing<=0)throw new Error('Sample spacing must be positive.');
 const segments=ROUTE.slice(1).map((p,i)=>({a:ROUTE[i],b:p,length:Math.hypot(p[0]-ROUTE[i][0],p[1]-ROUTE[i][1])}));
 const length=segments.reduce((n,s)=>n+s.length,0),count=Math.ceil(length/spacing),step=length/count,samples=[];
 for(let i=0;i<count;i++){let distance=(i+.5)*step;for(const seg of segments){if(distance<=seg.length){const t=distance/seg.length;samples.push({x:seg.a[0]+t*(seg.b[0]-seg.a[0]),z:seg.a[1]+t*(seg.b[1]-seg.a[1]),weight:step});break;}distance-=seg.length;}}
 return {length,samples};
}
export function blockedByBuilding(x,z,padding=.6){return BUILDINGS.some(b=>Math.abs(x-b.x)<b.w/2+padding&&Math.abs(z-b.z)<b.d/2+padding);}
export function onRoute(x,z,padding=1.3){return ROUTE.slice(1).some((b,i)=>{const a=ROUTE[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)<padding;});}
export function canPlant(design,x,z,ignoreId=null){const index=tileIndex(x,z);if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>39||Math.abs(z)>39||index<0)return 'Choose a point inside the landscape.';if(design.cover[index]==='water')return 'Choose dry ground for this tree.';if(blockedByBuilding(x,z))return 'A building occupies this spot.';if(onRoute(x,z))return 'Keep the walking route clear. Plant beside it.';if(design.trees.some(t=>t.id!==ignoreId&&Math.hypot(x-t.x,z-t.z)<1))return 'Leave a little space between tree trunks.';if(design.trees.length>=160&&!ignoreId)return 'This scene supports up to 160 trees.';return null;}
function validDate(str){if(typeof str!=='string'||!/^20[2-4]\d-\d{2}-\d{2}$/.test(str))return false;const date=new Date(str+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===str&&str>='2020-01-01'&&str<='2040-12-31';}
export function validateDesign(raw){
 if(!raw||!Array.isArray(raw.cover)||raw.cover.length!==100||raw.cover.some(x=>!COVERS.includes(x)))throw new Error('The file has an invalid land-cover grid.');
 if(!Array.isArray(raw.trees)||raw.trees.length>160)throw new Error('The file has too many trees or an invalid tree list.');
 const ids=new Set();
 const trees=raw.trees.map(t=>{if(!t||!Object.hasOwn(TREE_FORMS,t.type)||typeof t.id!=='string'||!/^t-[a-z0-9-]{1,40}$/.test(t.id)||ids.has(t.id))throw new Error('The file has an invalid tree identity.');
  for(const key of ['x','z','height','radius'])if(typeof t[key]!=='number'||!Number.isFinite(t[key]))throw new Error('A tree has invalid dimensions.');
  if(Math.abs(t.x)>39||Math.abs(t.z)>39||t.height<3||t.height>24||t.radius<.8||t.radius>7)throw new Error('A tree is outside the supported size or scene limits.');
  ids.add(t.id);return {id:t.id,type:t.type,x:t.x,z:t.z,height:t.height,radius:t.radius};
 });
 const clean={cover:[...raw.cover],trees};
 for(const t of trees){const error=canPlant(clean,t.x,t.z,t.id);if(error)throw new Error('A tree has an invalid position: '+error);}
 return clean;
}
export function parseScenario(text){
 if(text.length>250000)throw new Error('This file is too large for a landscape design.');
 let raw;try{raw=JSON.parse(text);}catch{throw new Error('Choose a valid JSON design file.');}
 if(raw?.format!=='landscape-climate-lab'||![1,2].includes(raw.version))throw new Error('Choose a Landscape Climate Lab version 1 or 2 design.');
 const sun=raw.sun;if(!sun||!validDate(sun.date)||typeof sun.hour!=='number'||!Number.isFinite(sun.hour)||sun.hour<5||sun.hour>21||![1,2].includes(sun.utcOffset)||typeof sun.dni!=='number'||!Number.isFinite(sun.dni)||sun.dni<0||sun.dni>1000)throw new Error('The file has invalid sun settings.');
 return {design:validateDesign(raw.design),baseline:validateDesign(raw.baseline),sun:{date:sun.date,hour:sun.hour,utcOffset:sun.utcOffset,dni:sun.dni},thermal:raw.version===1?initialThermal():validateThermal(raw.thermal)};
}
export function scenarioJSON(design,baseline,sun,thermal=initialThermal()){return JSON.stringify({format:'landscape-climate-lab',version:2,design,baseline,sun,thermal},null,2);}

export function initialThermal(){return {airTemperature:30,wind:2,humidity:50,moisture:.6};}
export function validateThermal(raw){
 if(!raw||typeof raw!=='object')throw new Error('The file has no surface-temperature settings.');
 const limits={airTemperature:[5,45],wind:[.2,8],humidity:[10,95],moisture:[0,1]},out={};
 for(const [key,[min,max]] of Object.entries(limits)){const v=raw[key];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error('The file has invalid surface-temperature settings.');out[key]=v;}
 return out;
}
