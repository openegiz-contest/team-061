import {T,esc,num,select} from './store.js';
import {STATE_RU} from './registry.js';
import {axleLoads} from './truck-physics.js';
import {openTruckInspector} from './truck-inspector.js';
export function renderTruckDashboard(host,id){
 const {attributes:a,features:f}=T[id], n=(x,d=0)=>Number.isFinite(x)?num(x,d):'—', cap=a.capacity_t||130;
 const load=axleLoads(f.payload,a.empty_t||106), speed=Math.max(0,Number(f.speed)||0), fuel=Math.max(0,Math.min(100,Number(f.fuel_pct)||0));
 const label=id.replace(/^truck-/, '');
 const row=(label,value)=>`<span>${label}</span><b>${value}</b>`;
 const html=`<div class="fp"><div class="fp-title">Панель водителя · ${esc(label)}</div><div class="fp-sub">${esc(a.name||'Самосвал 130 т')} · данные Ditto</div><div class="truck-speed"><svg viewBox="0 0 200 115" aria-hidden="true"><path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#344653" stroke-width="12"/><path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#57b8ff" stroke-width="12" pathLength="100" stroke-dasharray="${Math.min(100,speed/60*100)} 100"/><text x="100" y="86" text-anchor="middle" fill="currentColor" style="font-size:42px">${n(f.speed,1)}</text><text x="100" y="111" text-anchor="middle" fill="currentColor" style="font-size:12px">км/ч · шкала 0–60</text></svg></div><div class="chip ${f.alarm?'alarm':'ok'}">${esc(STATE_RU[f.state]||f.state||'Нет связи')}</div>${f.alarm?`<p>${esc(f.alarm)}</p>`:''}</div>
 <div class="fp"><h3>Рейс и машина</h3><div class="kv">${f.trip_route?row('Рейс',esc(f.trip_route)):''}${row('Направление',f.speed>.1?(f.reverse?'Задний ход':'Вперёд'):'Стоит')}${f.station_bay>=0&&f.destination==='CR'?row('Место разгрузки',f.station_bay+1):''}${row('Груз',`${n(f.payload,1)} / ${cap} т`)}${row('Материал',esc(f.material==='ore'?'Руда':f.material==='waste'?'Вскрыша':f.material||'—'))}${row('Назначение',esc(f.destination||'—'))}${row('Экскаватор',esc(f.shovel||'—'))}${row('Мощность',`${n(f.power_kw)} кВт`)}${row('Топливо',`${n(f.fuel)} л · ${n(f.fuel_pct,1)} %`)}</div><progress aria-label="Остаток топлива" max="100" value="${fuel}" style="width:100%"></progress>${f.payload>cap?'<p class="chip alarm">Перегруз</p>':''}${Number.isFinite(f.fuel_pct)&&fuel<15?'<p class="chip warn">Малый остаток топлива</p>':''}</div>
 <div class="fp"><h3>Наработка</h3><div class="kv">${row('Моточасы',`${n(f.engine_hours,1)} ч`)}${row('Рейсы',n(f.trips_total))}${row('Перевезено',`${n(f.tonnes_total)} т`)}${row('Износ',`${n(f.wear,1)} %`)}</div></div>
 <div class="fp"><h3>Нагрузки · расчётная оценка</h3><div class="kv">${row('Полная масса',`${n(load.mass,1)} т`)}${row('Передняя ось',`${n(load.front,1)} т`)}${row('Задняя ось',`${n(load.rear,1)} т`)}</div><p class="muted">Статическая оценка при опущенном кузове. Компоновка класса 130 т; параметры требуют калибровки по паспорту машины.</p><p class="muted">Обороты, температуры и давление масла: датчики не подключены.</p></div>
`;
 // Keep actions mounted while telemetry refreshes, so a press cannot lose its target.
 if(host.dataset.truckId!==id||!host.querySelector('[data-truck-live]')){
  host.dataset.truckId=id;host.innerHTML='<div class="fp row"><button data-truck-focus>Показать в 3D</button><button data-truck-parts>Устройство самосвала</button></div><div data-truck-live></div>';
 }
 host.querySelector('[data-truck-live]').innerHTML=html;
 host.querySelector('[data-truck-focus]').onclick=()=>select(id,{focus:true,force:true});
 host.querySelector('[data-truck-parts]').onclick=()=>openTruckInspector(id);
}
