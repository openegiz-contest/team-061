// Illustrative 130 t class parameters; not OEM instrumentation or strength analysis.
export function axleLoads(payload=0, empty=106, angle=0) {
 const cargo=Math.max(0,Number(payload)||0), mass=empty+cargo;
 const fraction=Math.max(.08,Math.min(.4,(-4.7+4.3*Math.cos(angle)-2*Math.sin(angle)+2.9)/7.3));
 const front=empty*.48+cargo*fraction;
 return {mass,front,rear:mass-front,frontCompression:cargo*fraction*9810/5000000,rearCompression:cargo*(1-fraction)*9810/6000000};
}
export function springStep(s,target,dt) {
 // Bounded substeps keep the damped response stable at low frame rates.
 let left=Math.min(.1,Math.max(0,dt));
 while(left>0){const h=Math.min(.005,left);s.v+=((target-s.y)*100-s.v*12)*h;s.y+=s.v*h;left-=h;}
 s.y=Math.max(-.03,Math.min(.26,s.y));return s.y;
}
