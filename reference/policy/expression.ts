/** Bounded arithmetic language. No eval, property access, strings or executable imports. */
export type Expr={kind:'number';value:number}|{kind:'variable';name:string}|{kind:'call';name:string;args:Expr[]}|{kind:'op';name:string;args:Expr[]};
const arities:Record<string,number>={min:2,max:2,abs:1,clamp:3,if:3};
const precedence:Record<string,number>={'||':1,'&&':2,'==':3,'!=':3,'<':4,'<=':4,'>':4,'>=':4,'+':5,'-':5,'*':6,'/':6};
export function compile(source:string,variables:ReadonlySet<string>):Expr{
 if(source.length>4000)throw Error('式は4000文字までです');
 const tokens:string[]=[];let offset=0;
 while(offset<source.length){if(/\s/.test(source[offset])){offset++;continue;}const t=source.slice(offset).match(/^(?:\d+(?:\.\d*)?(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|&&|\|\||==|!=|<=|>=|[+*/(),!<>-])/i)?.[0];if(!t)throw Error(`${offset+1}文字目：使用できない記号です`);tokens.push(t);offset+=t.length;if(tokens.length>1024)throw Error('式が長すぎます');}
 let cursor=0,nodes=0;
 const add=(node:Expr)=>{if(++nodes>512)throw Error('式は512ノードまでです');return node;};
 function parse(min=0,depth=0):Expr{
  if(depth>24)throw Error('式の入れ子は24段までです');const t=tokens[cursor++];let left:Expr;
  if(t==='-'||t==='+'||t==='!')left=add({kind:'op',name:'unary'+t,args:[parse(7,depth+1)]});
  else if(t==='('){left=parse(0,depth+1);if(tokens[cursor++]!==')')throw Error('閉じ括弧が必要です');}
  else if(t&&/^\d|^\./.test(t)){const value=Number(t);if(!Number.isFinite(value)||Math.abs(value)>1e6)throw Error('数値は±100万以内です');left=add({kind:'number',value});}
  else if(t&&/^[A-Za-z_]/.test(t)){
   if(tokens[cursor]==='('){if(!Object.hasOwn(arities,t))throw Error(`未知の関数: ${t}`);cursor++;const args:Expr[]=[];if(tokens[cursor]!==')'){do{args.push(parse(0,depth+1));if(tokens[cursor]!==',')break;cursor++;}while(true);}if(tokens[cursor++]!==')'||args.length!==arities[t])throw Error(`${t}は引数${arities[t]}個です`);left=add({kind:'call',name:t,args});}
   else{if(!variables.has(t))throw Error(`未知の変数: ${t}`);left=add({kind:'variable',name:t});}
  }else throw Error('数値・変数・括弧が必要です');
  while(Object.hasOwn(precedence,tokens[cursor])&&precedence[tokens[cursor]]>=min){const op=tokens[cursor++],right=parse(precedence[op]+1,depth+1);left=add({kind:'op',name:op,args:[left,right]});}
  return left;
 }
 const result=parse();if(cursor!==tokens.length)throw Error(`予期しない記号: ${tokens[cursor]}`);return result;
}
export function evaluate(node:Expr,values:Record<string,number>,budget={left:8192}):number{
 if(--budget.left<0)throw Error('評価回数の上限に達しました');let n:number;
 const run=(e:Expr)=>evaluate(e,values,budget);
 if(node.kind==='number')return node.value;
 if(node.kind==='variable'){if(!Object.hasOwn(values,node.name))throw Error(`値がありません: ${node.name}`);n=values[node.name];}
 else{
  const a=run(node.args[0]);
  if(node.kind==='call'){
   if(node.name==='if')return run(node.args[a!==0?1:2]);
   if(node.name==='abs')n=Math.abs(a);
   else{const b=run(node.args[1]);if(node.name==='min')n=Math.min(a,b);else if(node.name==='max')n=Math.max(a,b);else{const c=run(node.args[2]);if(b>c)throw Error('clampの下限が上限を超えています');n=Math.min(c,Math.max(b,a));}}
  }else{
   if(node.name==='unary-')n=-a;else if(node.name==='unary+')n=a;else if(node.name==='unary!')n=Number(!a);
   else if(node.name==='&&')n=a?Number(!!run(node.args[1])):0;
   else if(node.name==='||')n=a?1:Number(!!run(node.args[1]));
   else{const b=run(node.args[1]);switch(node.name){case '+':n=a+b;break;case '-':n=a-b;break;case '*':n=a*b;break;case '/':if(b===0)throw Error('0では割れません');n=a/b;break;case '<':n=Number(a<b);break;case '>':n=Number(a>b);break;case '<=':n=Number(a<=b);break;case '>=':n=Number(a>=b);break;case '==':n=Number(a===b);break;default:n=Number(a!==b);}}
  }
 }
 if(!Number.isFinite(n)||Math.abs(n)>1e12)throw Error('評価結果が数値の上限を超えました');return n;
}
