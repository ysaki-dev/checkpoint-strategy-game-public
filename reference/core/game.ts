import { CONFIG as C } from './config.ts';
import { type World,type Point,terrain,passable,distance,checkpointWindow,waterHigh } from './map.ts';
import { vision,type RuleMode } from './visibility.ts';
export interface Player extends Point {score:number; input:Point; inputAt:number}
export interface Checkpoint {cooldownUntil:number; owner:number|null; since:number; contested:boolean; priority:number|null}
export interface Capture {time:number;cp:number;player:number;points:number;scores:number[];secretPoints?:number;secretScores?:number[]}
export interface Frame {time:number;positions:Point[]}
export class Game {
 elapsed=-C.prepare; phase:'select'|'prepare'|'playing'|'finished'='prepare'; high=false;
 players:Player[]; cps:Checkpoint[]; captures:Capture[]=[]; frames:Frame[]=[];
 private arrivals:(number|null)[][];
 private secretTargets:(number|null)[]=[null,null]; private secretScores=[0,0];
 winner:number|null=null; reason='time'; private frameAt=-1;
 constructor(public world:World,public readonly mode:RuleMode='standard'){this.high=world.initialHigh;this.players=[0,1].map(()=>({...world.start,score:0,input:{x:0,y:0},inputAt:-Infinity}));this.cps=world.cps.map(()=>({cooldownUntil:0,owner:null,since:0,contested:false,priority:null}));this.arrivals=world.cps.map(()=>[null,null]);}
 chooseSecret(id:number,cp:number|null){if(this.mode!=='secret'||this.phase!=='prepare'||this.elapsed>=0||!Number.isInteger(id)||id<0||id>1||(cp!==null&&(!Number.isInteger(cp)||cp<0||cp>=this.world.cps.length)))return false;this.secretTargets[id]=cp;return true;}
 input(id:number,x:number,y:number){if(!Number.isFinite(x)||!Number.isFinite(y))return;const n=Math.hypot(x,y);this.players[id].input=n>1?{x:x/n,y:y/n}:{x,y};this.players[id].inputAt=this.elapsed;}
 stop(id:number){this.players[id].input={x:0,y:0};}
 advance(){if(this.phase==='finished'||this.phase==='select')return;this.elapsed=Math.round((this.elapsed+C.tick)*1000)/1000;
 const starting=this.phase==='prepare'&&this.elapsed>=0;
 if(starting){this.phase='playing';this.players.forEach((p,i)=>{Object.assign(p,this.world.start);this.stop(i);});}

 const high=waterHigh(this.world,this.elapsed);
 if(high&&!this.high){for(const p of this.players)if(terrain(this.world,p)==='ford')this.evacuate(p);}
 this.high=high;
 for(const p of this.players){if(this.elapsed-p.inputAt>C.inputTimeout)this.stop(this.players.indexOf(p));const multiplier=terrain(this.world,p)==='road'?C.roadMultiplier:1, step=C.speed*multiplier*C.tick;
 const nx={x:p.x+p.input.x*step,y:p.y};if(passable(this.world,nx,this.high))p.x=nx.x;
 const ny={x:p.x,y:p.y+p.input.y*step};if(passable(this.world,ny,this.high))p.y=ny.y;
 }
 if(this.elapsed<0)return;
 // At 300.000 the match closes after processing completions at that exact tick.
 for(let i=0;i<this.cps.length;i++){
 const cp=this.cps[i],arrivals=this.arrivals[i];
 // Remember continuous entry even while closed/cooling. A departure forfeits that place.
 for(let id=0;id<this.players.length;id++)arrivals[id]=distance(this.players[id],this.world.cps[i])<=C.captureRadius?(arrivals[id]??this.elapsed):null;
 const present=arrivals.flatMap((time,id)=>time===null?[]:[{id,time}]).sort((a,b)=>a.time-b.time);
 cp.priority=present.length===0||present.length>1&&present[0].time===present[1].time?null:present[0].id;
 cp.contested=present.length>1&&cp.priority===null;
 if(!checkpointWindow(this.world,i,this.elapsed,cp.cooldownUntil).active){cp.owner=null;continue;}
 // Five seconds start only on activation or transfer, never during the wait.
 if(cp.owner!==cp.priority){cp.owner=cp.priority;cp.since=this.elapsed;}
 if(cp.owner!==null&&this.elapsed-cp.since>=C.capture-1e-8){const id=cp.owner,points=pointsAt(this.elapsed,this.bonus().cp===i);this.players[id].score+=points;const extra=this.mode==='secret'&&this.secretTargets[id]===i?C.secretPoints:0;this.secretScores[id]+=extra;this.captures.push({time:this.elapsed,cp:i,player:id,points,scores:this.players.map(p=>p.score),...(this.mode==='secret'?{secretPoints:extra,secretScores:[...this.secretScores]}:{})});cp.cooldownUntil=this.elapsed+C.cooldown;cp.owner=null;cp.contested=false;}
 }
 if(this.elapsed-this.frameAt>=.2-1e-8){this.frames.push({time:this.elapsed,positions:this.players.map(p=>({x:p.x,y:p.y}))});this.frameAt=this.elapsed;}
 if(this.elapsed>=C.duration)this.finish('time');
 }
 evacuate(p:Point){const q=[{x:Math.floor(p.x)+.5,y:Math.floor(p.y)+.5}],seen=new Set<string>();for(let i=0;i<q.length;i++){const n=q[i],key=n.x+','+n.y;if(seen.has(key))continue;seen.add(key);if(passable(this.world,n,true)){p.x=n.x;p.y=n.y;return;}for(const [x,y]of [[1,0],[-1,0],[0,1],[0,-1]]){const next={x:n.x+x,y:n.y+y};if(next.x>=0&&next.y>=0&&next.x<this.world.width&&next.y<this.world.height)q.push(next);}}}
 bonus(time=this.elapsed){return this.world.bonuses.find(b=>b.end>Math.max(0,time))??this.world.bonuses.at(-1)!;}
 visible(viewer:number,target:number){return vision(this.world,this.players[viewer],this.players[target],this.mode).visible;}
 finish(reason:string,winner?:number){this.phase='finished';this.reason=reason;const totals=this.players.map((p,i)=>p.score+this.secretScores[i]);this.winner=winner??(totals[0]===totals[1]?null:totals[0]>totals[1]?0:1);this.players.forEach((_,i)=>this.stop(i));}
 view(id:number){const enemy=1-id,visibility=vision(this.world,this.players[id],this.players[enemy],this.mode),visible=visibility.visible,done=this.phase==='finished',scoresHidden=this.mode==='secret'&&!done,publicScores=this.players.map(p=>p.score);
 // Never expose an opponent's private increment through capture history or score snapshots.
 const captures=this.captures.map(c=>({time:c.time,cp:c.cp,player:c.player,points:scoresHidden?null:c.points,scores:scoresHidden?null:[...c.scores],...(done&&this.mode==='secret'?{secretPoints:c.secretPoints}:{}),...(done&&c.secretScores?{secretScores:[...c.secretScores]}:{})}));
 return {mode:this.mode,phase:this.phase,elapsed:this.elapsed,high:this.high,scoresHidden,scores:scoresHidden?null:done?publicScores.map((n,i)=>n+this.secretScores[i]):publicScores,publicScores:scoresHidden?null:publicScores,selfSecret:this.mode==='secret'?{cp:this.secretTargets[id],points:scoresHidden?null:this.secretScores[id]}:null,vision:visibility,self:{x:this.players[id].x,y:this.players[id].y},enemy:visible?{x:this.players[enemy].x,y:this.players[enemy].y}:null,
 cps:this.cps.map((c,i)=>({...checkpointWindow(this.world,i,this.elapsed,c.cooldownUntil),cooldownUntil:c.cooldownUntil,priority:c.priority===id||visible?c.priority:null,owner:c.owner===id||visible?c.owner:null,progress:c.owner===id||visible?c.owner===null?0:Math.min(1,(this.elapsed-c.since)/C.capture):0,contested:c.contested&&visible})),captures,winner:this.winner,reason:this.reason,
 ...(done?{replay:{mode:this.mode,frames:this.frames,captures:this.captures.map(c=>({...c,scores:[...c.scores],...(c.secretScores?{secretScores:[...c.secretScores]}:{})})),world:this.world,secretTargets:[...this.secretTargets],secretScores:[...this.secretScores]}}:{})};}
}
export function pointsAt(time:number,bonus:boolean){const phase=time<C.phaseBoundaries[0]?0:time<C.phaseBoundaries[1]?1:2;return C.points[phase][bonus?1:0];}
export type View=ReturnType<Game['view']>;
