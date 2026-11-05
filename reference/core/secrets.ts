import { distance,type World } from './map.ts';
/** Private pre-match draw; this helper has no access to either player's choice/state. */
export function chooseBotSecret(world:World,draw:number){
 const weights=world.cps.map((cp,i)=>world.openings.filter(o=>o.cp===i).reduce((n,o)=>n+o.end-o.start,0)/(distance(world.start,cp)+5));
 let value=Math.max(0,Math.min(.999999999,draw))*weights.reduce((a,b)=>a+b,0);
 for(let i=0;i<weights.length;i++){value-=weights[i];if(value<0)return i;}return weights.length-1;
}
