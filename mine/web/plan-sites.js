import {FUEL_LAYOUT as FS} from './fuel-layout.js';
// Metre-based survey symbols. Site frames match sim/crews.py; process coordinates stay unchanged.
const NS='http://www.w3.org/2000/svg';
const e=(tag,a={},p)=>{const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(a))n.setAttribute(k,v);p?.appendChild(n);return n;};
const pts=p=>p.map(([x,y])=>`${x.toFixed(2)},${(-y).toFixed(2)}`).join(' ');
const attr=(T,id)=>T[id]?.attributes||{};
const parse=x=>{try{return typeof x==='string'?JSON.parse(x):x;}catch{return null;}};
export function siteFrames(T){
 const cr=attr(T,'crusher'),c=parse(attr(T,'crusher').site)||parse(attr(T,'crush-site').site)||{},cs=parse(attr(T,'cos-site').site)||{};
 const origin=[cr.x??714.9,cr.y??-77.7],px=origin[0]+260,py=origin[1]+40;
 const frame=(o,h=0)=>(u=0,r=0)=>[o[0]+u*Math.cos(h)+r*Math.sin(h),o[1]+u*Math.sin(h)-r*Math.cos(h)];
 const xy=(id,fallback)=>{const a=attr(T,id);return [a.x??fallback[0],a.y??fallback[1]];};
 const dump=xy('dump',[375.3,680.7]);let dumpHeading=0;const roads=parse(attr(T,'road-haul-dump').geometry)||[];const approach=roads.flatMap(p=>[p,p.slice().reverse()]).filter(p=>p.length>1).sort((a,b)=>Math.hypot(a.at(-1)[0]-dump[0],a.at(-1)[1]-dump[1])-Math.hypot(b.at(-1)[0]-dump[0],b.at(-1)[1]-dump[1]))[0];if(approach){const a=approach.at(-2),b=approach.at(-1);dumpHeading=Math.atan2(b[1]-a[1],b[0]-a[0]);}
 return {dump:frame(dump,dumpHeading),rom:frame(xy('stockpile-rom',[600,400])),crush:frame(c.o||origin,c.h||0),stock:frame(cs.o||xy('stockpile-cos',[px-90,py]),cs.h||0),grind:frame(xy('mill-sag',[px,py+10])),flot:frame(xy('flotation',[px+80,py-25])),thk:frame(xy('thk-site',[px+150,py-70])),tls:frame([px+150,py+40]),tsf:frame([origin[0]+1560,origin[1]-1480]),ws:frame(xy('workshop',[725.9,351.6])),fs:frame(xy('fuel-station',[623.1,346.6])),gpp:frame(xy('power',[px-40,py+130]))};
}
export function buildSites(plan,fac,yards,T){
 fac.parentNode.insertBefore(yards,fac);
 const F=siteFrames(T),anchors={},labelNodes=[],all=[],plant=[],service=[],tsf=[],dump=[],rom=[];
 const addBounds=(p,bucket)=>{all.push(...p);bucket?.push(...p);};
 const obj=(id,parent=fac,detail=false)=>e('g',{'data-id':id,class:'sp-obj'+(detail?' pl-detail':'')},parent);
 const label=(id,p,text,major=false,detail=false,parent=fac)=>{const n=plan.text(parent,p[0],-p[1],text,{class:'sp-txt '+(major?'pl-lbl':'pl-note')});n.dataset.major=major?'1':'0';n.dataset.detail=detail?'1':'0';n.dataset.overview=['Ремонтная мастерская','АЗС и склад ГСМ','ККД-1500/180','Склад КДР','ГПП-110/6 кВ','Хвостохранилище','Обогатительная фабрика','Отвал вскрышных пород','Перегрузочный склад'].includes(text)?'1':'0';if(id){anchors[id]=p;n.setAttribute('data-id',id);}labelNodes.push(n);return n;};
 const line=(p,parent=fac,a={})=>e('polyline',{points:pts(p),fill:'none',stroke:'#777','stroke-width':'var(--lw)',...a},parent);
 const rectPoints=(f,u,r,w,d)=>[[u-w/2,r-d/2],[u+w/2,r-d/2],[u+w/2,r+d/2],[u-w/2,r+d/2]].map(p=>f(...p));
 const rect=(f,u,r,w,d,id,text,detail=false,bucket=plant,fill='#ebe6d6')=>{const p=rectPoints(f,u,r,w,d),g=obj(id,fac,detail);e('polygon',{points:pts(p),fill,stroke:'#282721','stroke-width':'calc(var(--lw)*1.3)',class:'sp-shape'},g);e('polygon',{points:pts(p),fill:'url(#bhatch)',opacity:.35,'pointer-events':'none'},g);anchors[id]=f(u,r);if(text)label(id,f(u,r+d/2+8),text,!detail,detail,g);addBounds(p,bucket);return g;};
 const circle=(f,u,r,rad,id,text,detail=false,bucket=plant)=>{const p=f(u,r),g=obj(id,fac,detail);e('circle',{cx:p[0],cy:-p[1],r:rad,fill:'#dfd8c4',stroke:'#414138','stroke-width':'calc(var(--lw)*1.2)',class:'sp-shape'},g);for(const d of [[-rad,0],[rad,0],[0,-rad],[0,rad]])line([p,f(u+d[0],r+d[1])],g,{stroke:'#777','stroke-dasharray':'3 2'});anchors[id]=p;if(text)label(id,f(u,r+rad+8),text,!detail,detail,g);addBounds(rectPoints(f,u,r,rad*2,rad*2),bucket);return g;};
 const apron=(f,u,r,w,d,text,bucket=plant)=>{const p=rectPoints(f,u,r,w,d);e('polygon',{points:pts(p),fill:'#e6dfcd','fill-opacity':.65,stroke:'#978c74','stroke-width':'var(--lw)','stroke-dasharray':'4 3'},yards);if(text)label(null,f(u,r),text,false,true,yards);addBounds(p,bucket);};
 const route=(p,width=12,parent=yards)=>{line(p,parent,{stroke:'#767165','stroke-width':width+1.2,'stroke-linejoin':'round'});line(p,parent,{stroke:'#eee8d9','stroke-width':width,'stroke-linejoin':'round'});line(p,parent,{stroke:'#aaa18d','stroke-width':.5,'stroke-dasharray':'4 3'});};
 const fence=(f,p)=>line(p.map(q=>f(...q)),yards,{stroke:'#777566','stroke-dasharray':'3 2'});
 const gate=(f,u,r,width=14)=>{line([f(u-width/2,r),f(u+width/2,r)],fac,{stroke:'#f4f0e4','stroke-width':2.4});for(const sign of [-1,1])line([f(u+sign*width/2,r),f(u+sign*width/2,r+sign*width*.38)],fac,{stroke:'#555','stroke-width':'var(--lw)'});};
 const roadGeometry=Object.entries(T).filter(([n])=>n.startsWith('road-')).flatMap(([,t])=>parse(t.attributes.geometry)||[]);
 const nearest=p=>{let best=null,dist=Infinity;for(const pl of roadGeometry)for(let i=1;i<pl.length;i++){const a=pl[i-1],b=pl[i],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1))),q=[a[0]+t*dx,a[1]+t*dy],d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(d<dist){dist=d;best=q;}}return best;};
 // Repair shop: real 64 × 34 m hall, three front gates, office, parts store and wash area.
 // Стоянка техники на время взрывных работ (паспорт карьера parking): площадка у развязки J1, места 2 × 3.
 const park=parse(attr(T,'pit').parking);
 if(park){const along=(o)=>(u=0,r=0)=>[o[0]+u*Math.cos(park.h)+r*Math.sin(park.h),o[1]+u*Math.sin(park.h)-r*Math.cos(park.h)],f=along([park.x,park.y]),nf=along(park.node);
  apron(f,0,0,park.l,park.w,'Стоянка техники');
  for(let row=0;row<(park.rows??2);row++)for(const lat of(park.lat_m??[0,13,-13])){const u0=-row*(park.slot_m??18);line([[u0+6,lat-4.5],[u0-9,lat-4.5],[u0-9,lat+4.5],[u0+6,lat+4.5]].map(([u,r])=>nf(u,r)),yards,{stroke:'#8a836f'});}}
 apron(F.ws,6,23,142,94,null,service);
 route([F.ws(-58,46),F.ws(90,46),F.ws(110,43)],24);
 // The published service road is drawn by Plan.buildRoads; no diagonal shortcut across the depot.
 for(const u of [-20,0,20])route([F.ws(u,46),F.ws(u,17)],14);
 rect(F.ws,0,0,64,34,'workshop','Ремонтная мастерская',false,service);
 rect(F.ws,-42,-2,20,16,'workshop','АБК / инструментальная',true,service);
 rect(F.ws,44,-4,24,18,'ws-stock','Запчасти',true,service);
 rect(F.ws,-52,36,20,14,'workshop','Мойка узлов',true,service);
 for(const [i,u]of [-20,0,20].entries()){gate(F.ws,u,17);const g=obj(`ws-bay-${i+1}`,fac,true);line([F.ws(u-6.5,-13),F.ws(u-6.5,13),F.ws(u+6.5,13),F.ws(u+6.5,-13)],g);label(null,F.ws(u,0),`Пост ${i+1}`,false,true,g);}
 for(const u of [-20,0,20,40]){const p=rectPoints(F.ws,u,33,12,14);line([...p,p[0]],yards,{stroke:'#aaa','stroke-dasharray':'2 2'});}
 fence(F.ws,[[-65,5],[-65,70],[77,70],[77,5]]);
 line([F.ws(-52,8),F.ws(-36,8),F.ws(-36,17),F.ws(-30,17)],yards,{stroke:'#a19a65','stroke-width':2,'stroke-dasharray':'2 2'});
 // Industrial fuel depot uses the same dimensions as its 3D model.
 apron(F.fs,(FS.base.x0+FS.base.x1)/2,0,FS.base.x1-FS.base.x0,FS.base.z1-FS.base.z0,null,service);
 route([F.fs(-119,10.4),F.fs(67,10.4)],24);route([F.fs(-43,-5.5),F.fs(67,-5.5)],12);route([F.fs(55,-23.5),F.fs(55,28.5)],24);
 route([F.fs(-118,0),F.fs(-38,0)],10);const fsJoin=nearest(F.fs(-118,10.4));if(fsJoin)route([fsJoin,F.fs(-118,10.4)],24);
 for(const [i,r]of FS.tanks.z.entries()){rect(F.fs,FS.tanks.x,r,FS.bund.w,FS.bund.d,`fs-tank-${i+1}`,null,false,service,'#d8d1bb');rect(F.fs,FS.tanks.x,r,FS.tanks.barrel+2*FS.tanks.head,2*FS.tanks.radius,`fs-tank-${i+1}`,`Резервуар ${i+1} · 30 м³`,true,service,'#abb5a4');}
 rect(F.fs,FS.pump.x,FS.pump.z,FS.pump.w,FS.pump.d,'fs-site','Насосная ГСМ',true,service);
 const canopy=rect(F.fs,FS.canopy.x,FS.canopy.z,FS.canopy.w,FS.canopy.d,'fuel-station','АЗС и склад ГСМ',false,service,'#eee9d6');canopy.dataset.planRole='fuel-canopy';
 line([...rectPoints(F.fs,FS.canopy.x,FS.canopy.z,FS.canopy.w,FS.canopy.d),F.fs(FS.canopy.x-FS.canopy.w/2,FS.canopy.z-FS.canopy.d/2)],canopy,{'stroke-dasharray':'4 3'});
 rect(F.fs,FS.island.x,FS.island.z,FS.island.w,FS.island.d,'fs-site',null,true,service);
 for(const [i,q]of FS.dispensers.entries())rect(F.fs,q.x,q.z,1.4,1,`fs-disp-${i+1}`,null,true,service);
 rect(F.fs,FS.operator.x,FS.operator.z,FS.operator.w,FS.operator.d,'fs-site','Операторная',true,service);
 rect(F.fs,FS.lubricants.x,FS.lubricants.z,FS.lubricants.w,FS.lubricants.d,'fs-site','Масла и смазки',true,service);
 rect(F.fs,FS.tanker.dockX,0,18,7,'fs-tanker','Слив автоцистерны',true,service);rect(F.fs,FS.tanker.waitX,0,18,7,'fs-tanker','Ожидание цистерны',true,service);
 // Waste dump: the operating plateau and lower terraces match dump3d.js.
 const dumpGroup=obj('dump');dumpGroup.dataset.planRole='waste-dump';
 for(const [extent,elevation]of [[72,-30],[56,-20],[28,-10],[0,0]]){const p=[[-210,-65-extent],[60+extent,-65-extent],[60+extent,65+extent],[-210,65+extent]].map(q=>F.dump(...q));e('polygon',{points:pts(p),fill:extent===0?'#e2d7bf':'#d4c3a5',stroke:'#806749','stroke-width':'var(--lw)',class:'sp-shape'},dumpGroup);addBounds(p,dump);if(extent)label(null,F.dump(65+extent,30),`Δh ${elevation} м`,false,true,dumpGroup);}
 for(const d of [16,44,72])line([[-210,-65-d],[60+d,-65-d],[60+d,65+d],[-210,65+d]].map(q=>F.dump(...q)),dumpGroup,{stroke:'#8c7050','stroke-dasharray':'2 3'});
 line([[-165,-55],[51,-55],[51,55],[-165,55]].map(q=>F.dump(...q)),dumpGroup,{stroke:'#88795d','stroke-width':6});
 rect(F.dump,-12,0,92,95,'dump',null,true,dump,'#ded7c5');
 for(const r of [-2,12]){const bay=rect(F.dump,0,r,19,10,'dump',null,true,dump);line([F.dump(-9.5,r-5),F.dump(8,r-5),F.dump(8,r+5),F.dump(-9.5,r+5)],bay,{stroke:'#8e793f','stroke-dasharray':'3 2'});}
 rect(F.dump,30,32,12,7,'dump','Зона бульдозера',true,dump);rect(F.dump,-95,36,5,4,'dump','Пост отвала',true,dump);
 for(const r of [-146,146])line([F.dump(-195,r),F.dump(155,r)],dumpGroup,{stroke:'#477b88','stroke-width':2});
 rect(F.dump,167,130,25,18,'dump','Отстойник',true,dump,'#d6e4e5');line([F.dump(154,146),F.dump(154,130)],dumpGroup,{stroke:'#477b88','stroke-width':2});
 label('dump',F.dump(-55,-22),'Отвал вскрышных пород',true,false,dumpGroup);
 label(null,F.dump(0,49),'Ярусы / площадка разгрузки',false,true,dumpGroup);
 // ROM is an elongated heap, a loader work area and a real truck loading bay.
 apron(F.rom,-2.5,-12.5,285,225,null,rom);
 const rg=obj('stockpile-rom');rg.dataset.planRole='rom-stockpile';
 const heap=[];for(let i=0;i<=20;i++){const a=-Math.PI/2+i*Math.PI/20;heap.push(F.rom(15+28*Math.cos(a),-65+28*Math.sin(a)));}for(let i=0;i<=20;i++){const a=Math.PI/2+i*Math.PI/20;heap.push(F.rom(-45+28*Math.cos(a),-65+28*Math.sin(a)));}
 e('polygon',{points:pts(heap),fill:'#d4bf9e',stroke:'#745b38','stroke-width':'calc(var(--lw)*1.5)',class:'sp-shape'},rg);addBounds(heap,rom);line([F.rom(-45,-65),F.rom(15,-65)],rg,{stroke:'#8e7651','stroke-dasharray':'3 2'});
 label('stockpile-rom',F.rom(-15,-65),'Перегрузочный склад',true,false,rg);
 rect(F.rom,-5,17,155,44,'stockpile-rom','Разгрузочная площадка',true,rom,'#e0d5be');
 rect(F.rom,64,-24,17,22,'stockpile-rom','Погрузка 130 т',true,rom);rect(F.rom,98,23,8,6,'stockpile-rom','Пост склада',true,rom);
 route([F.rom(-120,55),F.rom(140,55)],24);
 line([F.rom(-15,-26),F.rom(-8,-27),F.rom(54,-24)],rg,{stroke:'#9b8346','stroke-dasharray':'3 3'});label(null,F.rom(18,-33),'Рабочая зона погрузчика',false,true,rg);
 // Crusher footprint comes from the same site record as the 3D chamber and unloading bays.
 const cr=parse(attr(T,'crusher').site)||parse(attr(T,'crush-site').site)||{},b=cr.bunker||{u0:5,u1:22,r0:-18,r1:18},r0=b.r0,r1=b.r1;
 apron(F.crush,-35,-8,200,100,null,plant);
 const crTurn=[[-135,-40],[-25,-40],[-25,40],[-135,40]].map(q=>F.crush(...q));line([...crTurn,crTurn[0]],yards,{stroke:'#96866a','stroke-dasharray':'4 3'});label(null,F.crush(-78,-30),'Разворот и подача задним ходом',false,true);
 rect(F.crush,29,(r0+r1)/2,18,r1-r0,'crusher','ККД-1500/180',false,plant);
 rect(F.crush,(b.u0+b.u1)/2,(r0+r1)/2,b.u1-b.u0,r1-r0,'bunker-cr','Приёмный бункер',true,plant,'#c9c0a9');
 for(const bay of cr.bays||[]){route([F.crush(b.u0-40,bay.r),F.crush(b.u0-5,bay.r)],14);label(bay.id||null,F.crush(b.u0-16,bay.r),bay.id||'Разгрузка',false,true);}
 rect(F.crush,-14,-27,12,7,'crusher','Операторная',true,plant);
 rect(F.crush,cr.mcc?.u??31,cr.mcc?.r??40,12,9,'feeder-crusher','РУ 6 кВ',true,plant);
 // Storage: current cone radius and the actual reclaim tunnel beneath it.
 const radius=T['stockpile-cos']?.features?.radius_m??36;
 apron(F.stock,0,0,112,112,null,plant);
 circle(F.stock,0,0,radius,'stockpile-cos','Склад КДР');
 const reclaim=obj('cos-fd-1',fac,true);line([F.stock(-34,0),F.stock(46,0)],reclaim,{stroke:'#555','stroke-width':8,'stroke-dasharray':'7 4'});label(null,F.stock(0,8),'Тоннель питателей',false,true,reclaim);
 // Shared stepped exterior of the adjacent grinding and flotation departments (no double walls).
 const gp=[[-50,-32],[103,-32],[103,73],[-50,73]].map(q=>F.grind(...q)),fp=[[-44,-34],[104,-34],[104,26],[-44,26]].map(q=>F.flot(...q));
 const gx0=gp[0][0],gx1=gp[1][0],gy0=gp[2][1],gy1=gp[0][1],fx0=fp[0][0],fx1=fp[1][0],fy0=fp[2][1],fy1=fp[0][1];
 const hull=[[gx0,gy0],[gx1,gy0],[gx1,fy0],[fx1,fy0],[fx1,fy1],[gx1,fy1],[gx1,gy1],[gx0,gy1]];
 const hall=obj('mill-sag');e('polygon',{points:pts(hull),fill:'#ebe6d6',stroke:'#26251f','stroke-width':'calc(var(--lw)*1.5)',class:'sp-shape'},hall);e('polygon',{points:pts(hull),fill:'url(#bhatch)',opacity:.25},hall);addBounds([...gp,...fp],plant);
 label(null,F.grind(46,-55),'Обогатительная фабрика',true,false,hall);
 label('mill-sag',F.grind(0,10),'Измельчение',true,false,hall);
 label('flotation',F.flot(80,-2),'Флотация',true);
 const sections=obj('flotation',fac,true);line([[gx1,fy1],[gx1,fy0]],sections,{stroke:'#777','stroke-dasharray':'4 3'});
 rect(F.grind,-10,0,6.1,11.6,'mill-sag','МПСИ',true);rect(F.grind,30,0,13.6,7.9,'mill-ball','МШЦ',true);
 for(let i=0;i<6;i++)circle(F.flot,-24+i*9.5,-18,4,'flot-rougher',null,true);
 for(let i=0;i<4;i++)circle(F.flot,-24+i*9.5,14,4,'flot-scav',null,true);
 rect(F.flot,-61,36,38,14,'reagents','Реагентное хозяйство',true);
 rect(F.flot,-63,-25,28,12,'flot-air','Воздуходувная',true);
 // Concentrate and tailings are separate process areas in the existing 3D frames.
 circle(F.thk,-85,-35,7.5,'thick-conc','Сгуститель концентрата');
 rect(F.thk,0,-12,54,28,'filter-conc','Фильтр-прессы');
 rect(F.thk,80,22,36,28,'thk-store','Склад концентрата');
 circle(F.tls,-45,0,25,'thick-tail','Сгуститель хвостов');
 rect(F.tls,20,-18,28,18,'up-t1','Насосная выгрузки',true);
 circle(F.tls,62,-12,4.5,'tail-station',null,true);
 rect(F.tls,110,-18,30,20,'tail-pump','Насосная хвостов');
 rect(F.tls,62,62,70,55,'tail-station','Аварийный резервуар',true,plant,'#d8d2bd');
 apron(F.tls,62.5,6,355,212,null,plant);rect(F.tls,-70,-62,15,13,'floc-store','Подготовка флокулянта',true);circle(F.tls,154,70,2.5,'tail-pipe','Промывочная вода',true);
 // Local rail at the real rail-loading bunker, with an outgoing route away from buildings.
 const rail=[F.thk(-235,58),F.thk(330,58)];
 line(rail,yards,{stroke:'#252525','stroke-width':2.2});line(rail,yards,{stroke:'#f4f0e4','stroke-width':1,'stroke-dasharray':'1 5'});addBounds(rail,plant);
 rect(F.thk,40,58,12,9,'thk-store','Ж/д погрузка',true);rect(F.thk,28,46,13,5,'thk-store','Пост отгрузки',true);
 rect(F.thk,-116,-61,22,16,'floc-store','Флокулянт',true);apron(F.thk,47.5,0,565,170,null,plant);
 // GPP: real transformer pads, switchgear and perimeter, rather than a single rectangle.
 apron(F.gpp,-3.5,3,163,110,null,plant);fence(F.gpp,[[-68,-48],[68,-48],[68,56],[-68,56],[-68,-48]]);
 for(const [i,r]of [-26,-8].entries())rect(F.gpp,-6,r,10,6.5,`gpp-t${i+1}`,`Т${i+1}`,true);
 rect(F.gpp,46,-10,28,16,'power','ГПП-110/6 кВ');rect(F.gpp,-50,28,12,8,'gpp-site',null,true);
 for(let i=0;i<2;i++)rect(F.gpp,45,22+i*8,12,4,`gpp-cap-${i+1}`,null,true);
 // Current TSF: 1000 × 1040 m crest, stepped dam and east pond, as in tsf-details.js.
 const damHeight=T.tailings?.features?.dam_h??42,outer=12+damHeight*3;
 apron(F.tsf,467.5,0,1645,1420,null,tsf);
 const basin=obj('tailings');basin.dataset.planRole='tailings-storage';
 for(const d of [-outer,-6-1.5*damHeight-6,-6-1.5*damHeight,-6,6,6+2.5*damHeight]){const p=rectPoints(F.tsf,500,0,1000-2*d,1040-2*d);e('polygon',{points:pts(p),fill:d===-outer?'#d3c6ad':d===6+2.5*damHeight?'#d6c9b3':'none',stroke:'#776346','stroke-width':'var(--lw)',class:'sp-shape'},basin);addBounds(p,tsf);}
 for(const r of [-330,-110,110,330]){const p=rectPoints(F.tsf,420,r,520,210);e('polygon',{points:pts(p),fill:'url(#bhatch)',opacity:.25},basin);}
 const pond=[];for(let i=0;i<72;i++){const a=i*Math.PI/36;pond.push(F.tsf(730+115*Math.cos(a),105*Math.sin(a)));}e('polygon',{points:pts(pond),fill:'#d8e5e9',stroke:'#46708b','stroke-width':'var(--lw)'},basin);e('polygon',{points:pts(pond),fill:'url(#whatch)'},basin);
 label('tailings',F.tsf(420,0),'Хвостохранилище',true,false,basin);
 circle(F.tsf,-205,-125,24.5,'thk-water','Бак оборотной воды',false,tsf);rect(F.tsf,-155,-170,18,12,'thk-water','Насосная оборотной воды',true,tsf);
 for(const [i,u]of [-215,-195].entries())rect(F.tsf,u,320,5,5,'well-'+(i+1),'Скважина '+(i+1),true,tsf);
 rect(F.tsf,1170,40,12,8,'tsf-geo','Дренажная насосная',true,tsf);
 route([F.tsf(1000+outer+12,-650),F.tsf(1000+outer+12,650)],4);
 anchors.tailings=F.tsf(420,0);
 // General access to the mill service side, respecting the building exterior.
 const serviceRoad=[F.crush(40,-65),F.stock(0,-68),F.grind(20,-58),F.gpp(66,48)];route(serviceRoad,10);
 // Put the actual haul roads above the filled waste/ROM footprints.
 for(const [id,roadId]of [['dump','road-haul-dump'],['stockpile-rom','road-haul-plant']]){const q=attr(T,id),g=obj(id);for(const pl of parse(attr(T,roadId).geometry)||[]){const points=pl.filter(p=>Math.hypot(p[0]-q.x,p[1]-q.y)<220);if(points.length>1)route(points,24,g);}}
 // Survey captions must remain above later equipment fills.
 for(const n of labelNodes)fac.appendChild(n);
 const box=(p,pad)=>{const xs=p.map(q=>q[0]),ys=p.map(q=>-q[1]);return [Math.min(...xs)-pad,Math.min(...ys)-pad,Math.max(...xs)-Math.min(...xs)+pad*2,Math.max(...ys)-Math.min(...ys)+pad*2];};
 for(const t of Object.values(T))if(t.attributes?.x!=null&&!t.attributes.kind?.includes('person'))all.push([t.attributes.x,t.attributes.y]);
 if(plan.shell)for(const row of [plan.shell.xyz[0],plan.shell.xyz[plan.shell.slots-5]])for(let i=0;i<row.length;i+=3)all.push([row[i],row[i+1]]);
 for(const [id,rad]of []){const q=attr(T,id);if(q.x!=null)for(const dx of [-rad,rad])for(const dy of [-rad,rad])all.push([q.x+dx,q.y+dy]);}
 const village=attr(T,'aq-village');if(village.x!=null)all.push([village.x-115,village.y+165],[village.x+100,village.y-35]);
 const shell=plan.shell?.xyz[plan.shell.slots-5]||[],pit=[];for(let i=0;i<shell.length;i+=3)pit.push([shell[i],shell[i+1]]);
 return {F,anchors,fitBoxes:{all:box(all,100),pit:box(pit,60),plant:box(plant,55),service:box(service,35),tsf:box(tsf,35),dump:box(dump,35),rom:box(rom,35),dw:[-235,-45,190,90]},line,route,label};
}
export function buildNetworks(plan,conveyors,water,slurry,power,T,L){
 const {F,line,label}=L;
 const net=(id,p,g,color,dash,text,width=1.6)=>{const n=e('g',{'data-id':id,class:'sp-obj'},g);line(p,n,{stroke:'transparent','stroke-width':10});line(p,n,{stroke:color,'stroke-width':`calc(var(--lw)*${width})`,'stroke-dasharray':dash,'stroke-linejoin':'round'});if(text){const q=p[Math.floor(p.length/2)];const t=label(null,[q[0],q[1]+6],text,false,true,n);t.classList.add('pl-network');}return n;};
 const csite=parse(attr(T,'cos-site').site)||{};
 const k1=[csite.k1_from?F.stock(...csite.k1_from):F.crush(86,0),F.stock(0,0)];
 for(const [id,p,text]of [['conv-1',k1,'К-1 → склад КДР'],['conv-2',[F.stock(46,0),F.stock(58,0),F.stock(58,-10),F.grind(-18,0)],'К-2 → МПСИ']]){const n=net(id,p,conveyors,'#3c3b33','',text,4);line(p,n,{stroke:'#ede8da','stroke-width':'calc(var(--lw)*2)'});}
 for(const p of [[[22,-18],[22,0],[40,0],[76,22]],[[91,32],[40,58]]]){const n=net('thk-store',p.map(q=>F.thk(...q)),conveyors,'#3c3b33','','Концентрат · конвейер',3);line(p.map(q=>F.thk(...q)),n,{stroke:'#ede8da','stroke-width':'var(--lw)'});}
 const tlOut=F.tls(235,40),tsfIn=F.tsf(0,-170);
 net('tail-pipe',[tlOut,[tlOut[0]+100,tlOut[1]],[tlOut[0]+100,tsfIn[1]+160],[tsfIn[0]-90,tsfIn[1]+160],[tsfIn[0]-90,tsfIn[1]],tsfIn],slurry,'#8c5b38','8 3 2 3','Хвосты · DN700');
 net('thick-tail',[F.flot(12,26),F.flot(12,42),F.tls(-100,38),F.tls(-100,2),F.tls(-45,2)],slurry,'#8c5b38','8 3 2 3','Флотация → хвосты');
 net('thick-conc',[F.flot(104,20),F.flot(122,20),F.thk(-110,-35),F.thk(-85,-35)],slurry,'#a28347','8 3 2 3','Концентрат');
 net('thk-water',[F.tsf(-155,-170),F.tsf(-285,-170),F.tsf(-285,-240),[F.tls(190,-90)[0],F.tsf(-285,-240)[1]],F.tls(190,-90),F.tls(-100,-90),F.tls(-100,-22)],water,'#2375a1','7 3','Оборотная вода');
 net('thk-water',[F.tls(-100,-22),F.tls(-112,-22),F.grind(-64,-44),F.grind(-64,14),F.grind(60,14)],water,'#2375a1','7 3','Вода → измельчение');
 const site=plan.frames&&T.dewatering?.attributes?.site;
 // Follow published inclined dewatering tunnel where available.
 let dw;try{dw=parse(site);}catch{};
 const h=dw?.house;
 const house=h?[(h.x0+h.x1)/2,(h.y0+h.y1)/2]:[-197,0],well=dw?.well;
 if(well)net('pl-hdr',[house,[house[0],well.y0-4],[(well.x0+well.x1)/2,well.y0-4],[(well.x0+well.x1)/2,0]],water,'#2375a1','7 3','Насосная / водоотлив');
 const g=F.gpp(46,-10),bus=F.gpp(76,0);
 for(const [id,target]of [['feeder-crusher',F.crush(40,43)],['feeder-mill',F.grind(-20,-32)],['feeder-flot',F.flot(-44,-34)],['feeder-pit',[-120,160]]]){
   const p=[g,bus,[bus[0]+15,bus[1]],[bus[0]+15,Math.max(bus[1],target[1])+60],[target[0],Math.max(bus[1],target[1])+60],target];
   net(id,p,power,'#a23f3f','3 3',id==='feeder-pit'?'6 кВ → карьер':'6 кВ');
 }
 for(const [i,r]of [-26,-8].entries())net(`gpp-line-${i+1}`,[F.gpp(-60,r),F.gpp(-95,r),F.gpp(-160,r-80)],power,'#a23f3f','','ВЛ 110 кВ');
 plan.wrap.querySelector('.sp-legend').insertAdjacentHTML('beforeend','<div class="pl-net-note">Межплощадочные сети — схема связей</div>');
}
