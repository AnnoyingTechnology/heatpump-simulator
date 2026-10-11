/** Monotonized-central finite-volume enthalpy reconstruction. The limiter
 * changes numerical face values only; finite cell M/U is never projected. */
export function boundedEnthalpyFaces(values:readonly number[],leftInflow?:number,rightInflow?:number):{left:number;right:number}[]{
  const minmod=(a:number,b:number,c:number)=>Math.sign(a)===Math.sign(b)&&Math.sign(a)===Math.sign(c)?
    Math.sign(a)*Math.min(Math.abs(a),Math.abs(b),Math.abs(c)):0;
  return values.map((h,j)=>{
    const a=j===0?(leftInflow??h):values[j-1],b=j===values.length-1?(rightInflow??h):values[j+1];
    const slope=minmod(2*(h-a),(b-a)/2,2*(b-h));
    return {left:h-slope/2,right:h+slope/2};
  });
}

/** Active linear coefficients for the same MC reconstruction, for a sparse
 * one-sided derivative away from limiter switches. Boundary slopes are zero. */
export function boundedFaceWeights(values:readonly number[]):{left:[number,number][];right:[number,number][]}[]{
  return values.map((h,j)=>{
    const a=values[j-1]??h,b=values[j+1]??h,d=[2*(h-a),(b-a)/2,2*(b-h)];
    if(j===0||j===values.length-1||!d.every(v=>Math.sign(v)===Math.sign(d[0]))||d[0]===0)
      return {left:[[j,1]],right:[[j,1]]};
    const k=d.map(Math.abs).indexOf(Math.min(...d.map(Math.abs)));
    if(k===0)return {left:[[j-1,1]],right:[[j,2],[j-1,-1]]};
    if(k===1)return {left:[[j,1],[j-1,.25],[j+1,-.25]],right:[[j,1],[j-1,-.25],[j+1,.25]]};
    return {left:[[j,2],[j+1,-1]],right:[[j+1,1]]};
  });
}
