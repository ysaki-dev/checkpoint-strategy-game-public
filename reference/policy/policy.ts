import { CONFIG as C } from '../core/config.ts';
import { pointsAt,type View } from '../core/game.ts';
import { checkpointWindow,distance,passable,terrain,type World,type Point } from '../core/map.ts';
import { compile,evaluate,type Expr } from './expression.ts';
export const FEATURES=['gain','cp_id','my_distance','enemy_distance','capture_progress','my_eta','wait','enemy_known','enemy_eta','enemy_heading','arrival_advantage','turn_rate','occupied','capturing','is_secret','is_cp','is_hill','is_wait','same_target','target_age','time','remaining'] as const;
export interface PolicySpec {version:1;name:string;formula:string;parameters:Record<string,number>;switchWhen?:string}
export interface Policy {spec:PolicySpec;formula:Expr;switchWhen:Expr}
export const EXAMPLE:PolicySpec={version:1,name:'先着と観察',formula:'if(is_cp, gain / (1 + my_eta + wait) + race * arrival_advantage + read * enemy_heading * (1 - turn_rate) + secret * is_secret - 2 * occupied + 2 * capturing, -1)',parameters:{race:.8,read:1.2,secret:.5},switchWhen:''};
export function parsePolicy(text:string):Policy{
 if(text.length>32000)throw Error('方策テキストは32000文字までです');let data:any;try{data=JSON.parse(text);}catch{throw Error('JSONとして読み込めません');}
 if(!data||Array.isArray(data)||data.version!==1)throw Error('version: 1 の方策を入力してください');
 if(Object.keys(data).some(k=>!['version','name','formula','parameters','switchWhen'].includes(k)))throw Error('未対応の設定項目があります');
 if(typeof data.name!=='string'||!data.name.trim()||data.name.length>60||typeof data.formula!=='string')throw Error('名前と式を確認してください');
 if(!data.parameters||typeof data.parameters!=='object'||Array.isArray(data.parameters)||Object.keys(data.parameters).length>32)throw Error('parametersは最大32個の数値です');
 for(const [key,value] of Object.entries(data.parameters)){if(!/^[A-Za-z_][A-Za-z_0-9]{0,31}$/.test(key)||['__proto__','prototype','constructor',...FEATURES].includes(key)||typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>10000)throw Error(`パラメータを確認してください: ${key}`);}
 if(data.switchWhen!==undefined&&typeof data.switchWhen!=='string')throw Error('切替条件は式の文字列です');
 const spec:PolicySpec={version:1,name:data.name.trim(),formula:data.formula,parameters:{...data.parameters},switchWhen:data.switchWhen??''},names=new Set([...FEATURES,...Object.keys(spec.parameters)]);
 return {spec,formula:compile(spec.formula,names),switchWhen:compile(spec.switchWhen?.trim()||'1',names)};
}
interface Candidate {key:string;kind:'cp'|'hill'|'wait';point:Point;cp?:number;path:Point[];features:Record<string,number>}
/** Formula agents receive only a player projection, never the mutable Game. */
export class FormulaBot{
 target='';lastError='';decisions=0;
 private route:Point[]=[];private nextDecision=-Infinity;private targetSince=0;private lastHigh=false;
 private seen:{point:Point;time:number;velocity:Point}|null=null;private turns=0;private observations=0;
 constructor(public readonly policy:Policy,private readonly id:number,private readonly scorer?:((features:Record<string,number>)=>number)){}
 private observe(v:View){if(!v.enemy)return;const prev=this.seen,dt=prev?v.elapsed-prev.time:0;let velocity={x:0,y:0};if(prev&&dt>0&&dt<=.5){velocity={x:(v.enemy.x-prev.point.x)/dt,y:(v.enemy.y-prev.point.y)/dt};const a=Math.hypot(prev.velocity.x,prev.velocity.y),b=Math.hypot(velocity.x,velocity.y);if(a>.2&&b>.2){this.observations++;if((prev.velocity.x*velocity.x+prev.velocity.y*velocity.y)/(a*b)<.5)this.turns++;}}this.seen={point:{...v.enemy},time:v.elapsed,velocity};}
 update(w:World,v:View):Point{
  if(v.phase!=='playing')return {x:0,y:0};this.observe(v);
  if(v.elapsed>=this.nextDecision||!this.target||v.high!==this.lastHigh){
   this.nextDecision=v.elapsed+C.botDecision;const highChanged=v.high!==this.lastHigh;this.lastHigh=v.high;const paths=routes(w,v.self,v.high),seen=this.seen&&v.elapsed-this.seen.time<=C.botMemory?this.seen:null;
   const candidates:Candidate[]=[];
   const add=(key:string,kind:Candidate['kind'],point:Point,cp?:number)=>{
    const path=paths(point);if(!path)return;const travel=path.reduce((n,p)=>n+1/(C.speed*(terrain(w,p)==='road'?C.roadMultiplier:1)),0),window=cp===undefined?null:checkpointWindow(w,cp,v.elapsed+travel,v.cps[cp].cooldownUntil),start=window?.nextOpen??v.elapsed+travel,wait=window?Math.max(0,start-v.elapsed-travel):0,done=start+C.capture;
    const valid=cp!==undefined&&window?.nextOpen!==null&&done<=C.duration&&checkpointWindow(w,cp,done,v.cps[cp].cooldownUntil).active;
    const bonus=valid&&w.bonuses.some(b=>b.cp===cp&&b.start<=done&&b.end>done),enemyEta=seen?distance(seen.point,point)/C.speed:0,speed=seen?Math.hypot(seen.velocity.x,seen.velocity.y):0,d=seen?distance(seen.point,point):0;
    const features:Record<string,number>={...this.policy.spec.parameters,cp_id:cp??-1,my_distance:distance(v.self,point),enemy_distance:seen?distance(seen.point,point):0,capture_progress:cp===undefined?0:v.cps[cp].progress,gain:valid?(pointsAt(done,!!bonus)+(v.selfSecret?.cp===cp?C.secretPoints:0))/2:0,my_eta:travel,wait,enemy_known:seen?1:0,enemy_eta:enemyEta,enemy_heading:seen&&speed>.2&&d>.1?((point.x-seen.point.x)*seen.velocity.x+(point.y-seen.point.y)*seen.velocity.y)/(d*speed):0,arrival_advantage:seen?Math.max(-1,Math.min(1,(enemyEta-travel)/10)):0,turn_rate:this.observations?this.turns/this.observations:0,occupied:cp!==undefined&&v.cps[cp].owner===1-this.id?1:0,capturing:cp!==undefined&&v.cps[cp].owner===this.id?1:0,is_secret:cp!==undefined&&v.selfSecret?.cp===cp?1:0,is_cp:kind==='cp'?1:0,is_hill:kind==='hill'?1:0,is_wait:kind==='wait'?1:0,same_target:this.target===key?1:0,target_age:v.elapsed-this.targetSince,time:v.elapsed,remaining:Math.max(0,C.duration-v.elapsed)};
    candidates.push({key,kind,point,cp,path,features});
   };
   w.cps.forEach((p,i)=>add('cp:'+i,'cp',p,i));w.hillAreas.forEach((p,i)=>add('hill:'+i,'hill',p));add('wait','wait',v.self);
   const budget={left:8192},current=candidates.find(c=>c.key===this.target);let allow=true;this.lastError='';
   try{if(current&&!highChanged)allow=evaluate(this.policy.switchWhen,current.features,budget)!==0;}catch(e){this.lastError=String((e as Error).message);allow=true;}
   if(allow){let chosen:Candidate|undefined,best=-Infinity;for(const c of candidates){try{const value=this.scorer?this.scorer(c.features):evaluate(this.policy.formula,c.features,budget);if(!Number.isFinite(value))throw Error('評価結果が有限の数値ではありません');if(value>best){best=value;chosen=c;}}catch(e){this.lastError=(e as Error).message;}}this.decisions++;if(chosen){if(chosen.key!==this.target||highChanged||!this.route.length){if(chosen.key!==this.target)this.targetSince=v.elapsed;this.route=[{x:Math.floor(v.self.x)+.5,y:Math.floor(v.self.y)+.5},...chosen.path];}this.target=chosen.key;}else{this.target='wait';this.route=[];}}
   else if(current&&!this.route.length&&distance(v.self,current.point)>.15)this.route=[{x:Math.floor(v.self.x)+.5,y:Math.floor(v.self.y)+.5},...current.path];
  }
  if(this.target==='wait')return {x:0,y:0};while(this.route.length&&distance(v.self,this.route[0])<.1)this.route.shift();const next=this.route[0];if(!next)return {x:0,y:0};if(!passable(w,next,v.high)){this.nextDecision=-Infinity;this.route=[];return {x:0,y:0};}const step=C.speed*C.tick*(terrain(w,v.self)==='road'?C.roadMultiplier:1);return {x:(next.x-v.self.x)/step,y:(next.y-v.self.y)/step};
 }
}
function routes(w:World,start:Point,high:boolean){const key=(p:Point)=>Math.floor(p.y)*w.width+Math.floor(p.x),root=key(start),queue=[root],prev=new Map<number,number>([[root,-1]]);for(let i=0;i<queue.length;i++){const n=queue[i],x=n%w.width,y=Math.floor(n/w.width);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const p={x:x+dx+.5,y:y+dy+.5},id=key(p);if(!prev.has(id)&&passable(w,p,high)){prev.set(id,n);queue.push(id);}}}return (p:Point)=>{let n=key(p);if(!prev.has(n))return null;const path:Point[]=[];while(n!==root){path.push({x:n%w.width+.5,y:Math.floor(n/w.width)+.5});n=prev.get(n)!;}return path.reverse();};}
