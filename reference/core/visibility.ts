import { CONFIG as C } from './config.ts';
import { distance,terrain,type Point,type World } from './map.ts';
export type RuleMode='standard'|'secret';
export function vision(world:World,self:Point,enemy:Point,mode:RuleMode){
 const a=terrain(world,self),b=terrain(world,enemy);
 if(mode==='standard')return {visible:b!=='forest'||distance(self,enemy)<=C.forestRadius||(a==='hill'&&distance(self,enemy)<=C.hillRadius),radius:0,exposed:false,all:false};
 const all=a==='hill'||b==='hill',radius=a==='forest'||b==='forest'?C.secretForestRadius:C.secretViewRadius;
 return {visible:all||distance(self,enemy)<=radius,radius:a==='forest'?C.secretForestRadius:C.secretViewRadius,exposed:a==='hill',all};
}
