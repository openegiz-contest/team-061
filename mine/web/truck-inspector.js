import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {haulTruck} from './models.js';
let closeCurrent;
export function openTruckInspector(id='130 т'){
 closeCurrent?.();const previous=document.activeElement;
 const dialog=document.createElement('dialog');dialog.className='truck-inspector';dialog.innerHTML=`<header><b>Устройство самосвала · ${String(id).replace(/^truck-/, '').replace(/[<>&"']/g,'')}</b><button data-close aria-label="Закрыть разбор">✕</button></header><p>Учебная компоновка класса 130 т. Выберите узел, вращайте модель мышью.</p><div class="truck-inspector-grid"><div data-canvas></div><aside><label>Разнести узлы <input data-explode type="range" min="0" max="1" step="0.01" value="0"></label><button data-assemble>Собрать</button><div data-list></div><p data-info>Выберите узел для описания.</p></aside></div>`;document.body.append(dialog);dialog.showModal();
 const host=dialog.querySelector('[data-canvas]'),scene=new THREE.Scene();scene.background=new THREE.Color(0x17232e);
 const camera=new THREE.PerspectiveCamera(42,1,.1,200);camera.position.set(21,16,22);
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));host.append(renderer.domElement);
 const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,4,0);controls.minDistance=10;controls.maxDistance=70;controls.enableDamping=true;
 scene.add(new THREE.HemisphereLight(0xffffff,0x526171,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(8,20,10);scene.add(light);
 const truck=haulTruck(true,true);scene.add(truck);const parts=truck.userData.inspectionParts;
 const addBox=(name,size,pos,color,offset,description)=>{const node=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial({color}));node.position.set(...pos);truck.add(node);parts.push({name,node,offset,description});};
 addBox('Дизель и генератор',[3.2,1.8,1.8],[3.6,3.5,0],0x3b8a83,[4,3,-4],'Силовая установка: дизель приводит генератор; электропривод передаёт тягу задним колёсам. Условная компоновка.');
 for(const x of [4.4,-2.9])addBox(x>0?'Передняя подвеска':'Задний мост',[.7,.6,5.4],[x,1.9,0],0x7992a4,[x>0?2:-2,-.4,0],'Ось и подвеска передают нагрузки на раму; положение показано схематично.');
 for(const z of [-1.6,1.6]){
  const a=new THREE.Vector3(-.8,2.5,z),b=new THREE.Vector3(.5,3.6,z),delta=b.clone().sub(a),node=new THREE.Mesh(new THREE.CylinderGeometry(.17,.17,delta.length(),16),new THREE.MeshStandardMaterial({color:0xb9c5cf,metalness:.7,roughness:.3}));node.position.copy(a).lerp(b,.5);node.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());truck.add(node);parts.push({name:z<0?'Левый цилиндр подъёма':'Правый цилиндр подъёма',node,offset:[0,2,Math.sign(z)*4],description:'Парные гидроцилиндры поднимают кузов вокруг заднего шарнира.'});
 }
 for(const part of parts){if(part.name==='Переднее колесо')part.name+=part.node.position.z<0?' · левое':' · правое';else if(part.name==='Заднее мотор-колесо / шина')part.name+=(part.node.position.z<0?' · слева':' · справа')+(Math.abs(part.node.position.z)>3?' наружное':' внутреннее');}

 for(const part of parts){part.home=part.node.position.clone();part.node.traverse(m=>{if(m.isMesh){m.material=m.material.clone();m.userData.part=part;}});}
 const list=dialog.querySelector('[data-list]');parts.forEach((part,i)=>{const b=document.createElement('button');b.textContent=part.name;b.onclick=()=>choose(part);list.append(b);});
 function choose(part){dialog.querySelector('[data-info]').textContent=part.description;parts.forEach(p=>p.node.traverse(m=>{if(m.material?.emissive)m.material.emissive.setHex(p===part?0x346b94:0);}));[...list.children].forEach((b,i)=>b.classList.toggle('on',parts[i]===part));}
 const ray=new THREE.Raycaster();let down;renderer.domElement.onpointerdown=e=>{down=[e.clientX,e.clientY];};renderer.domElement.onpointerup=e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const b=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1),camera);const hit=ray.intersectObject(truck,true).find(h=>h.object.userData.part);if(hit)choose(hit.object.userData.part);};
 const slider=dialog.querySelector('[data-explode]');dialog.querySelector('[data-assemble]').onclick=()=>slider.value=0;
 const resize=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(w&&h){renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}});resize.observe(host);
 let raf,amount=0;function frame(){raf=requestAnimationFrame(frame);amount+=(Number(slider.value)-amount)*.12;parts.forEach(p=>p.node.position.copy(p.home).addScaledVector(new THREE.Vector3(...p.offset),amount));controls.update();renderer.render(scene,camera);}frame();
 function close(){cancelAnimationFrame(raf);resize.disconnect();controls.dispose();const geometries=new Set(),materials=new Set();scene.traverse(m=>{if(m.geometry)geometries.add(m.geometry);if(m.material)materials.add(m.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();dialog.remove();previous?.focus();closeCurrent=null;}
 closeCurrent=close;dialog.querySelector('[data-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
}
