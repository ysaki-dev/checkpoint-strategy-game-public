import { CONFIG as C } from './config.ts';
import { type View,pointsAt } from './game.ts';
import { type World,type Point,passable,distance,terrain,checkpointWindow } from './map.ts';
/** The bot receives the same filtered observation as a player, never the Game. */
export class Bot {
 target=-1;
 private route:Point[]=[];
 private nextDecision=-Infinity;
 private observation:{point:Point;time:number;velocity:Point}|null=null;
 readonly style:'interceptor'|'planner'|'challenger';
 constructor(seed=0){this.style=(['interceptor','planner','challenger'] as const)[Math.abs(seed)%3];}
 /** Infer intent only from visible observations; a hidden player is never an input. */
 private observe(view:View){
  if(!view.enemy)return;
  const previous=this.observation,dt=previous?view.elapsed-previous.time:0;
  const velocity=previous&&dt>0&&dt<=.5?{x:(view.enemy.x-previous.point.x)/dt*.35+previous.velocity.x*.65,y:(view.enemy.y-previous.point.y)/dt*.35+previous.velocity.y*.65}:{x:0,y:0};
  this.observation={point:{...view.enemy},time:view.elapsed,velocity};
 }
 predictedTarget(world:World,view:View){
  const seen=this.observation;if(!seen||view.elapsed-seen.time>C.botMemory)return null;
  const speed=Math.hypot(seen.velocity.x,seen.velocity.y);if(speed<.25)return null;
  let best=-Infinity,target:number|null=null;
  world.cps.forEach((p,i)=>{const d=distance(p,seen.point);if(d<.5)return;const alignment=((p.x-seen.point.x)*seen.velocity.x+(p.y-seen.point.y)*seen.velocity.y)/(d*speed);if(alignment<.45)return;
   const arrival=view.elapsed+d/C.speed,window=checkpointWindow(world,i,arrival,view.cps[i].cooldownUntil);if(window.nextOpen===null)return;
   const score=alignment*4-d*.06-Math.max(0,window.nextOpen-arrival)*.06;
   if(score>best){best=score;target=i;}
  });return target;
 }
 update(world:World,view:View):Point {
  if(view.phase!=='playing')return {x:0,y:0};
  const now=view.elapsed;this.observe(view);const predicted=this.predictedTarget(world,view);
  // Commit during a capture; reconsider routes once per second otherwise.
  if(this.target>=0&&view.cps[this.target].owner===1)return {x:0,y:0};
  if(now>=this.nextDecision||this.target<0){
   this.nextDecision=now+C.botDecision;
   const paths=routes(world,view.self,view.high);
   let best=-Infinity,chosen=-1,path:Point[]=[];
   world.cps.forEach((cp,i)=>{
    const p=paths(cp);if(!p)return;
    const travel=p.reduce((seconds,point)=>seconds+1/(C.speed*(terrain(world,point)==='road'?C.roadMultiplier:1)),0),window=checkpointWindow(world,i,now+travel,view.cps[i].cooldownUntil);if(window.nextOpen===null)return;const wait=window.nextOpen-now-travel,done=now+travel+wait+C.capture;
    if(!checkpointWindow(world,i,done,view.cps[i].cooldownUntil).active)return;
    const bonus=world.bonuses.find(b=>b.start<=done&&b.end>done)?.cp===i;
    let value=pointsAt(done,bonus)/(travel+wait+C.capture);
    // Visible opponents can change the bot's decision, hidden positions cannot.
    if(view.cps[i].owner===0||view.cps[i].priority===0||view.cps[i].contested)value*=.08;
    const seen=this.observation;
    if(seen&&predicted!==null){
     const age=now-seen.time,confidence=Math.max(0,1-age/C.botMemory),enemyArrival=distance(seen.point,cp)/C.speed;
     if(i===predicted){
      // Claim the opponent's destination before they arrive; do not chase a lost race.
      const canLead=travel+.6<enemyArrival;
      value*=canLead?1+confidence*(this.style==='challenger'?2.1:1.5):1-confidence*.6;
     }else{
      const future=world.bonuses.find(b=>b.start>=now&&b.cp===i),enemyNext=distance(seen.point,world.cps[predicted])/C.speed+C.capture+distance(world.cps[predicted],cp)/C.speed;
      if(future&&future.start-now<35&&travel<enemyNext&&done>=future.start&&done<future.end)value*=1+confidence*(this.style==='planner'?1.3:.7);
     }
    }
    if(this.style==='planner'&&wait>0&&wait<10&&bonus)value*=1.2;
    if(i===this.target)value*=1.12;
    if(done>C.duration)value=0;
    if(value>best){best=value;chosen=i;path=p;}
   });
   this.target=chosen;this.route=[{x:Math.floor(view.self.x)+.5,y:Math.floor(view.self.y)+.5},...path];
  }
  if(this.target<0)return {x:0,y:0};
  const cp=world.cps[this.target];
  // Stay for capture/cooldown. Leave contested points to avoid permanent ties.
  if(distance(view.self,cp)<C.captureRadius*.75&&!view.cps[this.target].contested&&view.cps[this.target].owner!==0)return {x:0,y:0};
  while(this.route.length&&distance(view.self,this.route[0])<.1)this.route.shift();
  const next=this.route[0];if(!next)return {x:0,y:0};
  const step=C.speed*C.tick*(terrain(world,view.self)==='road'?C.roadMultiplier:1);
  return {x:(next.x-view.self.x)/step,y:(next.y-view.self.y)/step};
 }
}
/** Four-neighbour routing; permanent bridges are used when water is high. */
function routes(w:World,start:Point,high:boolean){
 const key=(p:Point)=>Math.floor(p.y)*w.width+Math.floor(p.x),root=key(start),queue=[root],prev=new Map<number,number>();prev.set(root,-1);
 for(let i=0;i<queue.length;i++){const n=queue[i],x=n%w.width,y=Math.floor(n/w.width);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const p={x:x+dx+.5,y:y+dy+.5},id=key(p);if(!prev.has(id)&&passable(w,p,high)){prev.set(id,n);queue.push(id);}}}
 return (target:Point)=>{let n=key(target);if(!prev.has(n))return null;const path:Point[]=[];while(n!==root){path.push({x:n%w.width+.5,y:Math.floor(n/w.width)+.5});n=prev.get(n)!;}return path.reverse();};
}
