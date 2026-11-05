import modelData from './models/expert.json';
import reportData from './models/expert-report.json';
import currentReportData from './models/expert-current-report.json';
import { FormulaBot,parsePolicy } from './policy.ts';
import { predict,vector,validateNetwork,type Network } from './network.ts';
export const EXPERT_MODEL=modelData as Network;
validateNetwork(EXPERT_MODEL);
export const EXPERT_REPORT=reportData;
export const EXPERT_CURRENT_REPORT=currentReportData;
export const EXPERT_ID='route-shift-expert-mlp-v1';
export function expertScore(f:Record<string,number>){if(!f.is_cp)return -2;if(f.occupied)return -3;if(f.capturing)return 3;return predict(EXPERT_MODEL,vector(f));}
/** Learned candidate scorer + the same public navigation/observation interface as text policies. */
export class ExpertBot extends FormulaBot{
 constructor(id:number){super(parsePolicy(JSON.stringify({version:1,name:'学習済みMLP v1',formula:'gain',parameters:{}})),id,expertScore);}
}
