// Visual train movement reads process telemetry; preview mode never writes to Ditto.
import {T} from './store.js';
const f=(k,d=0)=>T['thk-store']?.features?.[k]??d;
export function updateConcentrateTrain(s,dt){
 const demo=!!s.concTrainDemo;
 let o=s.concTrain;
 if(!o||o.demo!==demo)o=s.concTrain={demo,clock:0,phase:'idle',active:false,cycle:f('trains'),loaded:Array(20).fill(0)};
 if(demo)o.clock+=dt*4;
 const remain=f('loading_min'),active=demo||remain>0,cycle=f('trains');let phase,n,part;
 if(demo){const t=o.clock;phase=t<60?'arrival':t<260?'loading':t<370?'departure':'complete';n=phase==='loading'?Math.min(20,Math.floor((t-60)/10)+1):phase==='departure'||phase==='complete'?20:0;part=phase==='loading'?Math.max(0,Math.min(1,((t-60)%10-4.5)/5.5)):n?1:0;}
 else{phase=active?(remain>80?'arrival':remain>20?'loading':'departure'):'idle';n=Math.max(0,Math.min(20,f('wagon_n')));part=Math.max(0,Math.min(1,f('scale_t')/60));}
 if(!active&&o.phase!=='idle'&&s.trainRoot.visible)phase='departure';
 const target=s.trainHP-(10+Math.max(0,n-1)*12.4),step=dt*(demo?4:1);
 const starting=active&&(!o.active||(!demo&&cycle!==o.cycle));
 if(starting){o.loaded.fill(0);s.trainRoot.position.x=phase==='arrival'?352:target;s.trainRoot.visible=phase!=='departure'||remain>=19;o.cycle=cycle;}
 if(phase==='arrival'){s.trainRoot.visible=true;const dest=s.trainHP-10;s.trainRoot.position.x=Math.max(dest,s.trainRoot.position.x-6*step);}
 else if(phase==='loading'){s.trainRoot.visible=true;const x=s.trainRoot.position.x;s.trainRoot.position.x=x+Math.sign(target-x)*Math.min(Math.abs(target-x),3*step);for(let i=0;i<20;i++)o.loaded[i]=i<n-1?1:i===n-1?part:0;}
 else if(phase==='departure'||(phase==='idle'&&o.active&&s.trainRoot.visible)||o.phase==='departure'&&phase==='idle'){
  if(phase==='departure'&&o.phase!=='departure')for(let i=0;i<20;i++)o.loaded[i]=1;
  s.trainRoot.position.x-=6*step;if(s.trainRoot.position.x<-510)s.trainRoot.visible=false;
 }else if(phase==='complete')s.trainRoot.visible=false;
 else if(!active)s.trainRoot.visible=false;
 o.phase=phase;o.active=active;
 s.wagons.forEach((w,i)=>{const a=Math.max(0,Math.min(1,o.loaded[i]));w.userData.cargo.visible=a>.001;w.userData.cargo.scale.y=a;w.userData.cargo.position.y=1.34+1.1*a;});
 s.concTrainLoading=phase==='loading'&&n>0&&s.trainRoot.visible&&Math.abs(s.trainRoot.position.x-target)<.15;
 if(s.concTrainBadge){s.concTrainBadge.hidden=!demo;s.concTrainBadge.textContent=phase==='arrival'?'Демо: прибытие состава':phase==='loading'?'Демо: погрузка · вагон '+n+'/20':phase==='departure'?'Демо: состав уезжает':'Демо завершено · выключите и включите для повтора';}
 s.host.dataset.trainAudit=JSON.stringify({mode:demo?'preview':'live',phase,visible:s.trainRoot.visible,x:s.trainRoot.position.x,wagon:n,aligned:s.concTrainLoading,loaded:o.loaded});
}
