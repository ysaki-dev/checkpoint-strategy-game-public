import { CONFIG as C } from './config.ts';
export type Terrain = 'plain'|'road'|'forest'|'hill'|'river'|'bridge'|'ford';
export interface Point { x:number; y:number }
export interface Bonus { cp:number; start:number; end:number }
export interface World { seed:number; profile:'standard'|'secret'; width:number; height:number; tiles:Terrain[]; rivers:Point[][]; hillAreas:Point[]; start:Point; cps:Point[]; bonuses:Bonus[]; openings:Bonus[]; initialHigh:boolean; water:{time:number;high:boolean}[] }
export function random(seed:number) { let a=seed>>>0; return ()=> {a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}; }
export function terrain(w:World,p:Point):Terrain|undefined {if(p.x<0||p.y<0||p.x>=w.width||p.y>=w.height)return;return w.tiles[Math.floor(p.y)*w.width+Math.floor(p.x)];}
export function passable(w:World,p:Point,high:boolean) {const t=terrain(w,p);return t!==undefined&&t!=='river'&&!(high&&t==='ford');}
export const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
export function generate(seed:number,profile:'standard'|'secret'='standard'):World {
 const r=random(seed), width=C.width,height=C.height;
 const w:World={seed,profile,width,height,tiles:Array(width*height).fill('plain'),rivers:[],hillAreas:[],start:{x:width/2+.5,y:height/2+.5},cps:[],bonuses:[],openings:[],initialHigh:false,water:[]};
 const set=(x:number,y:number,t:Terrain)=>{if(x>=0&&y>=0&&x<width&&y<height)w.tiles[y*width+x]=t;};
 // Woodland and independent viewpoints are painted before/after water respectively.
 for(let i=0;i<(profile==='secret'?C.secretForestPatches:24);i++){const x=2+r()*(width-4),y=2+r()*(height-4),rad=2.5+r()*2;for(let yy=Math.floor(y-rad);yy<=y+rad;yy++)for(let xx=Math.floor(x-rad);xx<=x+rad;xx++)if(Math.hypot(xx-x,yy-y)<rad)set(xx,yy,'forest');}
 const vertical=r()<.55,length=vertical?height:width,across=vertical?width:height,count=1+Math.floor(r()*C.maxRivers);
 const roadLines=[4+Math.floor(r()*4),length-8+Math.floor(r()*4)],fordLine=Math.floor(length/2)+Math.floor(r()*3)-1;
 for(let river=0;river<count;river++){
  const lane=across/(count+1),base=count===1?Math.floor(across*(.25+r()*.5)):Math.floor(lane*(river+1)+(r()-.5)*2);
  let cross=base;const points:Point[]=[];
  for(let along=0;along<length;along++){
   const before=cross;if(along%4===0)cross=Math.max(Math.ceil(base-lane*.22),Math.min(Math.floor(base+lane*.22),cross+Math.floor(r()*3)-1));
   for(let n=Math.min(before,cross);n<=Math.max(before,cross);n++){
    const x=vertical?n:along,y=vertical?along:n;set(x,y,'river');points.push({x:x+.5,y:y+.5});
   }
  }w.rivers.push(points);
 }
 for(const line of roadLines)for(let cross=0;cross<across;cross++){
  const x=vertical?cross:line,y=vertical?line:cross;set(x,y,terrain(w,{x,y})==='river'?'bridge':'road');
 }
 for(const river of w.rivers)for(const p of river){const along=vertical?Math.floor(p.y):Math.floor(p.x);if(Math.abs(along-fordLine)<=Math.floor(C.fordTiles/2))set(Math.floor(p.x),Math.floor(p.y),'ford');}
 const dry=(p:Point)=>{const t=terrain(w,p);return t==='plain'||t==='forest'||t==='hill';};
 const land:Point[]=[];for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){const p={x:x+.5,y:y+.5};if(dry(p)&&[[1,0],[-1,0],[0,1],[0,-1]].every(([dx,dy])=>passable(w,{x:p.x+dx,y:p.y+dy},true)))land.push(p);}
 land.sort((a,b)=>distance(a,{x:width/2,y:height/2})-distance(b,{x:width/2,y:height/2}));w.start={...land[0]};
 for(let i=0;i<C.checkpoints;i++){
  const desired={x:width*(i%2?.78:.22)+(r()-.5)*7,y:height*(.16+Math.floor(i/2)*.34)+(r()-.5)*3};
  const candidates=land.filter(p=>distance(p,w.start)>4&&w.cps.every(q=>distance(q,p)>=6)).sort((a,b)=>distance(a,desired)-distance(b,desired));
  if(!candidates.length)throw Error('CP placement');const p=candidates[0];w.cps.push({...p});
  const t:Terrain=i<2?'forest':profile==='secret'?'plain':i<4?'hill':'plain',radius=t==='hill'?2:1;
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const q={x:p.x+dx,y:p.y+dy};if(dry(q))set(Math.floor(q.x),Math.floor(q.y),t);}
 }
 const extraHills=profile==='secret'?C.secretHillAreas:2;
 for(let i=0;i<extraHills;i++){
  const desired={x:3+r()*(width-6),y:3+r()*(height-6)};
  const candidates=land.filter(p=>p.x>=(profile==='secret'?2:5)&&p.y>=(profile==='secret'?2:5)&&p.x<=width-(profile==='secret'?2:5)&&p.y<=height-(profile==='secret'?2:5)&&w.cps.every(cp=>distance(cp,p)>(profile==='secret'?4:10))&&w.hillAreas.every(h=>distance(h,p)>(profile==='secret'?6:13))).sort((a,b)=>distance(a,desired)-distance(b,desired));
  if(!candidates.length)throw Error('Independent hills');const p=candidates[0];w.hillAreas.push({...p});const radius=profile==='secret'?1.8+r()*.15:5.5+r()*.5
  for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){const q={x:p.x+dx,y:p.y+dy};if(Math.hypot(dx,dy)<=radius&&dry(q))set(Math.floor(q.x),Math.floor(q.y),'hill');}
 }
 let time=0,previous=-1;
 while(time<C.duration+C.bonusMax*3){let cp=Math.floor(r()*C.checkpoints);if(cp===previous)cp=(cp+1)%C.checkpoints;const end=time+C.bonusMin+Math.floor(r()*(C.bonusMax-C.bonusMin+1));w.bonuses.push({cp,start:time,end});previous=cp;time=end;}
 const order=Array.from({length:C.checkpoints},(_,i)=>i);for(let i=order.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
 for(let start=0,k=0;start<C.duration;start+=C.openingDuration,k++)for(let j=0;j<C.normalOpenCount;j++)w.openings.push({cp:order[(k*C.normalOpenCount+j)%order.length],start,end:start+C.openingDuration});
 w.initialHigh=r()<.5;
 w.water=[{time:C.waterChangeStart[0]+Math.floor(r()*(C.waterChangeStart[1]-C.waterChangeStart[0]+1)),high:!w.initialHigh},{time:C.waterChangeEnd[0]+Math.floor(r()*(C.waterChangeEnd[1]-C.waterChangeEnd[0]+1)),high:w.initialHigh}].slice(0,C.waterEventCount);
 const errors=validate(w);if(errors.length)throw Error('Invalid map: '+errors.join(', '));return w;
}
export function validate(w:World):string[]{
 const errors:string[]=[];
 for(const high of [false,true]){
 const seen=new Set<number>(),q=[Math.floor(w.start.y)*w.width+Math.floor(w.start.x)];seen.add(q[0]);
 for(let i=0;i<q.length;i++){const n=q[i],x=n%w.width,y=Math.floor(n/w.width);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const p={x:x+dx+.5,y:y+dy+.5},id=(y+dy)*w.width+x+dx;if(!seen.has(id)&&passable(w,p,high)){seen.add(id);q.push(id);}}}
 if(w.cps.some(p=>!seen.has(Math.floor(p.y)*w.width+Math.floor(p.x))))errors.push('unreachable CP');
 if(w.tiles.some((_,i)=>passable(w,{x:i%w.width+.5,y:Math.floor(i/w.width)+.5},high)&&!seen.has(i)))errors.push('isolated tile');
 }
 for(const t of ['forest','hill','road'] as Terrain[]){const ratio=w.tiles.filter(x=>x===t).length/w.tiles.length;if(ratio===0||ratio>(t==='forest'?(w.profile==='secret'?.72:.55):t==='hill'?.28:.2))errors.push('terrain ratio '+t);}
 if(w.rivers.some(points=>points.filter(p=>terrain(w,p)==='bridge').length<2))errors.push('river without two bridges');
 if(w.hillAreas.length<(w.profile==='secret'?C.secretHillAreas:2)||w.hillAreas.some(p=>w.cps.some(cp=>distance(cp,p)<=(w.profile==='secret'?4:10))))errors.push('independent hill areas');
 if(w.tiles.filter(x=>x==='bridge').length<2)errors.push('insufficient crossings');
 const ds=w.cps.map(p=>distance(p,w.start));if(Math.max(...ds)>Math.min(...ds)*4)errors.push('start distance bias');
 for(let i=0;i<w.cps.length;i++)for(let j=i+1;j<w.cps.length;j++)if(distance(w.cps[i],w.cps[j])<5)errors.push('CP spacing');
 if(w.bonuses.some(b=>b.end-b.start<C.bonusMin||b.end-b.start>C.bonusMax))errors.push('bonus duration');
 // Each bonus lasts longer than capture + a nearest-neighbour journey at base speed.
 if(w.cps.some((p,i)=>Math.min(...w.cps.filter((_,j)=>j!==i).map(q=>distance(p,q)))/C.speed+C.capture>C.bonusMin))errors.push('bonus travel');
 return errors;
}
export function createWorld(seed:number,profile:'standard'|'secret'='standard'):World {for(let i=0;i<1000;i++){try{return generate((seed+i)>>>0,profile);}catch{}}throw Error('Map generation exhausted');}

/** Merge public normal/bonus windows; cooldown can postpone availability beyond a window. */
export function checkpointWindow(w:World,cp:number,time:number,cooldown=0){
 const t=Math.max(0,time),windows=[...w.openings,...w.bonuses].filter(b=>b.cp===cp).sort((a,b)=>a.start-b.start),merged:{start:number;end:number}[]=[];
 for(const b of windows){const last=merged.at(-1);if(last&&b.start<=last.end)last.end=Math.max(last.end,b.end);else merged.push({start:b.start,end:b.end});}
 const current=merged.find(b=>b.start<=t&&b.end>t),next=merged.find(b=>Math.max(t,cooldown,b.start)<Math.min(b.end,C.duration)&&b.start<C.duration);
 return {open:!!current,active:!!current&&cooldown<=t,nextOpen:next?Math.max(t,cooldown,next.start):null,closes:current?Math.min(current.end,C.duration):null};
}

export function waterHigh(w:World,time:number){return w.water.filter(e=>e.time<=time).at(-1)?.high??w.initialHigh;}
