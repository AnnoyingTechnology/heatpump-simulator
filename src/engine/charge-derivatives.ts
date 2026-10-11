/** Small forward derivative algebra for the inventory residual. Values and
 * derivatives share each expression; no thermodynamics or correction lives here. */
export interface Differential { value:number; gradient:number[] }
export const constant=(value:number,size:number):Differential=>({value,gradient:Array(size).fill(0)});
export const coordinate=(value:number,size:number,index:number,scale:number):Differential=>{
  const result=constant(value,size);result.gradient[index]=scale;return result;
};
export const add=(a:Differential,b:Differential):Differential=>({value:a.value+b.value,gradient:a.gradient.map((v,i)=>v+b.gradient[i])});
export const subtract=(a:Differential,b:Differential):Differential=>({value:a.value-b.value,gradient:a.gradient.map((v,i)=>v-b.gradient[i])});
export const multiply=(a:Differential,b:Differential):Differential=>({value:a.value*b.value,gradient:a.gradient.map((v,i)=>v*b.value+a.value*b.gradient[i])});
export const divide=(a:Differential,b:Differential):Differential=>({value:a.value/b.value,gradient:a.gradient.map((v,i)=>(v-a.value/b.value*b.gradient[i])/b.value)});
export const scale=(a:Differential,factor:number):Differential=>({value:a.value*factor,gradient:a.gradient.map(v=>v*factor)});
export function compose(value:number,partials:number[],inputs:Differential[]):Differential {
  return {value,gradient:inputs[0].gradient.map((_,j)=>partials.reduce((sum,d,i)=>sum+d*inputs[i].gradient[j],0))};
}
