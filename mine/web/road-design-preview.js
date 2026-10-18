import {PitScene} from './pit.js';
import {T} from './store.js';
import {PB} from './playback.js';
const source=await fetch('pit_design.json',{cache:'no-store'}).then(r=>r.json());Object.assign(T,source);
const scene=new PitScene(document.querySelector('#design-canvas'),document.querySelector('#design-labels'));
scene.active=true;scene.staffOn=false;scene.onPick=id=>{scene.picked=id;};scene.onOpen=id=>scene.focus(id);PB.tp=15;
for(const button of document.querySelectorAll('[data-camera]'))button.onclick=()=>{scene.view(button.dataset.camera);document.querySelector('#pit-geo').value='3d';document.querySelector('#pit-geo-extra').hidden=true;for(const b of document.querySelectorAll('[data-camera]'))b.classList.toggle('active',b===button);};
document.querySelector('#design-label-toggle').onchange=e=>scene.showAllLabels=e.target.checked;
document.querySelector('#design-phase').oninput=e=>PB.tp=Number(e.target.value);
const timer=setInterval(()=>{scene.update(T);if(scene.built){clearInterval(timer);scene.view('pit');document.querySelector('#status').textContent='Проект загружен · колесо — приближение · перетаскивание — вращение · щелчок по технике — выделение';}},250);

const geo=document.querySelector('#pit-geo'),level=document.querySelector('#pit-level'),slice=document.querySelector('#pit-slice');
const updateGeo=()=>{document.querySelector('#pit-geo-extra').hidden=geo.value==='3d';scene.setGeology(geo.value,+level.value,+slice.value);};geo.onchange=level.onchange=slice.oninput=updateGeo;
