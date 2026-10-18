// Реестр объектов Стенда: человеко-понятные типы, группы дерева, состояние и положение по данным двойников.
import { T, v, attr } from "./store.js";

export const STATE_RU = {
  cr_turn:"Заезд и разворот у ККД", cr_reverse:"Подача задним ходом", cr_raise:"Подъём кузова", cr_lower:"Опускание кузова", cr_exit:"Выезд с разгрузки", to_rom_load:"На погрузку со склада", queue_rom:"Ожидание погрузчика", rom_enter:"Установка под погрузчик", rom_loading:"Погрузка со склада", rom_reverse:"Отъезд с погрузки задним ходом", rom_exit:"Выезд со склада", haul: "рейс с грузом", return: "порожний рейс", to_load: "к экскаватору", loading: "погрузка", spot: "установка под погрузку",
  queue_load: "очередь у экскаватора", queue_dump: "очередь на разгрузку", dumping: "разгрузка", fueling: "заправка", to_fuel: "на заправку",
  repair: "ремонт", to_ws: "в ремонтный бокс", parked: "стоит", blast_hold: "ожидание после взрыва", idle: "ожидает задания",
  to_shelter: "в укрытие (взрыв)", sheltered: "в укрытии: ждёт взрыва и проветривания", returning: "возвращается на забой", wait_face: "нет взорванной массы", down: "ремонт", no_power: "нет напряжения", blast_prep: "отогнан перед взрывом", spotting: "установка",
  drilling: "бурит", ready: "сетка готова", stop: "стоит", run: "работает", ramp: "набор нагрузки", trip: "защитное отключение", service: "обслуживание", jam: "зависание в бункере" };

export const KIND_RU = {"equipment-component":"Узел оборудования",
  mine: "Рудник", "open-pit": "Карьер", "processing-plant": "Обогатительная фабрика", substation: "Подстанция", "mining-face": "Забой",
  excavator: "Экскаватор", "drill-rig": "Буровой станок", "haul-truck": "Самосвал", "haul-road": "Дорога", dewatering: "Водоотлив", pump: "Насос",
  motor: "Электродвигатель", "gate-valve": "Задвижка", "check-valve": "Обратный клапан", "motor-cabinet": "Шкаф управления двигателем", plc: "ПЛК",
  "hmi-panel": "Панель оператора", "level-transmitter": "Уровнемер", "level-switch": "Сигнализатор уровня", "flow-transmitter": "Расходомер",
  "pressure-transmitter": "Датчик давления", pipeline: "Трубопровод", cable: "Кабельная линия", building: "Здание", "intake-well": "Приёмный колодец",
  crane: "Кран-балка", "slope-radar": "Радар борта", "air-monitor": "Пост контроля воздуха", "gyratory-crusher": "Дробилка", stockpile: "Склад руды",
  "waste-dump": "Отвал", "fuel-station": "АЗС и склад ГСМ", workshop: "Ремонтный бокс", "sag-mill": "Мельница МПСИ", "ball-mill": "Мельница МШЦ",
  flotation: "Флотация", tailings: "Хвостохранилище", feeder: "Фидер 6 кВ", "weather-station": "Метеостанция", personnel: "Бригада", "light-vehicle": "Лёгкий автомобиль",
  bunker: "Приёмный бункер", "plate-feeder": "Пластинчатый питатель", conveyor: "Ленточный конвейер", hydrocyclone: "Гидроциклоны", "slurry-pump": "Насос пульпы",
  "flotation-bank": "Флотомашина", "reagent-station": "Реагентное отделение", thickener: "Сгуститель", "filter-press": "Фильтр-пресс",
  "crushing-site": "Площадка ККД", "dump-bay": "Место разгрузки", "rock-breaker": "Гидромолот", "lube-system": "Маслостанция", "dust-suppression": "Пылеподавление",
  "stockpile-site": "Площадка склада КДР", dozer: "Бульдозер", "metal-detector": "Металлодетектор",
  "grinding-site": "Площадка измельчения", "slurry-sump": "Зумпф пульпы", "ball-charger": "Дозатор шаров",
  "flotation-site": "Цех флотации", conditioning: "Кондиционирование", "blower-station": "Воздуходувная станция", "regrind-mill": "Мельница доизмельчения", "xrf-analyzer": "Анализатор XRF",
  "thickening-site": "Площадка сгущения и хвостов", "barge-pump": "Барж-насос возврата воды", "water-well": "Скважина свежей воды", "reagent-store": "Склад флокулянта", "pump-station-tank": "Бак насосной станции", "geotech-monitor": "Геотехнический мониторинг", "concentrate-store": "Склад концентрата", "tailings-pipeline": "Пульпопровод хвостов", "water-tank": "Бак оборотной воды",
  "repair-bay": "Пост ремонта", "spare-parts": "Склад запчастей", "workshop-site": "Мастерская", "fuel-tank": "Резервуар ГСМ", "fuel-dispenser": "Раздаточная колонка", tanker: "Бензовоз",
  "fuel-site": "Площадка АЗС", "hv-line": "ЛЭП 110 кВ", transformer: "Силовой трансформатор", "switchgear-section": "Секция КРУ 6 кВ", "capacitor-bank": "Конденсаторная установка",
  "bus-tie": "Секционный выключатель", "gpp-site": "ГПП-110/6 кВ",
  person: "Сотрудник", "light-tower": "Осветительная мачта", module: "Модуль", control: "Пульт", registry: "Реестр",
};

// группа дерева → (порядок, подпись)
export const GROUPS = [
  ["face", "Забои и выемка"], ["truck", "Самосвалы"], ["road", "Дороги и освещение"], ["dw-pump", "Водоотлив: насосы"], ["dw-valve", "Водоотлив: арматура"],
  ["dw-elec", "Водоотлив: электрика и автоматика"], ["dw-kip", "Водоотлив: КИП"], ["dw-pipe", "Водоотлив: трубопроводы и кабель"], ["dw-civil", "Водоотлив: сооружения"],
  ["safe", "Безопасность"], ["ws", "Ремонтная мастерская"], ["fs", "АЗС и склад ГСМ"], ["gpp", "ГПП и энергоснабжение"], ["crush", "Дробление ККД"], ["dump", "Отвал вскрышных пород"], ["rom", "Перегрузочный склад"], ["stock", "Склад КДР и подача"], ["grind", "Измельчение и классификация"], ["flot", "Флотация"], ["thk", "Концентрат: сгущение и фильтрация"], ["tls", "Хвосты: сгущение и насосная"], ["tsf", "Хвостохранилище и оборотная вода"], ["plant", "Обогатительная фабрика"], ["power", "Энергоснабжение"], ["service", "Сервис и склады"], ["crew", "Бригады и транспорт персонала"],
];

const GROUP_OF = {
  "mining-face": "face", excavator: "face", "drill-rig": "face", "haul-truck": "truck", "haul-road": "road", "light-tower": "road", pump: "dw-pump", dewatering: "dw-pump",
  "gate-valve": "dw-valve", "check-valve": "dw-valve", motor: "dw-elec", "motor-cabinet": "dw-elec", plc: "dw-elec", "hmi-panel": "dw-elec",
  "level-transmitter": "dw-kip", "level-switch": "dw-kip", "flow-transmitter": "dw-kip", "pressure-transmitter": "dw-kip", pipeline: "dw-pipe", cable: "dw-pipe",
  building: "dw-civil", "intake-well": "dw-civil", crane: "dw-civil", "slope-radar": "safe", "air-monitor": "safe", "weather-station": "safe",
  "gyratory-crusher": "crush", stockpile: "plant", bunker: "crush", "plate-feeder": "plant", "crushing-site": "crush", "dump-bay": "crush", "rock-breaker": "crush", "lube-system": "crush", "dust-suppression": "crush", "stockpile-site": "stock", "grinding-site": "grind", "repair-bay": "ws", "spare-parts": "ws", "workshop-site": "ws", workshop: "ws", "fuel-tank": "fs", "fuel-dispenser": "fs", tanker: "fs", "fuel-site": "fs", "fuel-station": "fs", "hv-line": "gpp", transformer: "gpp", "switchgear-section": "gpp", "capacitor-bank": "gpp", "bus-tie": "gpp", "gpp-site": "gpp", substation: "gpp", feeder: "gpp", "thickening-site": "thk", "reagent-store": "thk", "pump-station-tank": "tls", "barge-pump": "tsf", "water-well": "tsf", "geotech-monitor": "tsf", "concentrate-store": "thk", "tailings-pipeline": "thk", "water-tank": "thk", tailings: "thk", thickener: "thk", "filter-press": "thk", "flotation-site": "flot", conditioning: "flot", "blower-station": "flot", "regrind-mill": "flot", "xrf-analyzer": "flot", flotation: "flot", "reagent-station": "flot", "flotation-bank": "flot", "slurry-sump": "grind", "ball-charger": "grind", dozer: "stock", "metal-detector": "stock", conveyor: "plant", hydrocyclone: "plant", "slurry-pump": "plant",
  "sag-mill": "grind", "ball-mill": "grind",
  "waste-dump": "dump", personnel: "crew", "light-vehicle": "crew",
};

const HIDDEN = new Set(["mine", "open-pit", "processing-plant", "module", "control", "registry", "person"]);

// сцена, в которой объект виден: pit — 3D карьер, dw — 3D водоотлив, plan — только на генплане/в окнах
const WS_IDS = new Set(["workshop", "ws-site", "ws-bay-1", "ws-bay-2", "ws-bay-3", "ws-stock", "ws-crane"]);
const FS_IDS = new Set(["fuel-station", "fs-site", "fs-tank-1", "fs-tank-2", "fs-disp-1", "fs-disp-2", "fs-tanker"]);
const GPP_IDS = new Set(["power", "feeder-pit", "feeder-crusher", "feeder-mill", "feeder-flot", "gpp-site", "gpp-line-1", "gpp-line-2", "gpp-t1", "gpp-t2", "gpp-bus-1", "gpp-bus-2", "gpp-tie", "gpp-cap-1", "gpp-cap-2"]);
const THK_IDS = new Set(["thick-conc", "filter-conc", "thk-press-2", "thk-store", "thk-site", "up-c1", "up-c2", "floc-store"]);
const TLS_IDS = new Set(["thick-tail", "tail-pump", "tail-pump-2", "tail-pipe", "up-t1", "up-t2", "tail-station"]);
const TSF_IDS = new Set(["tailings", "thk-water", "barge-1", "barge-2", "well-1", "well-2", "tsf-geo"]);
const FLOT_IDS = new Set(["flot-rougher", "flot-scav", "flot-clean", "reagents", "flotation", "flot-site", "flot-cond", "flot-air", "flot-regrind", "flot-xrf"]);
const GRIND_IDS = new Set(["mill-sag", "mill-ball", "sag-motor", "ball-motor", "cyclone", "slurry-pump-1", "slurry-pump-2", "grind-site", "grind-sump", "grind-balls"]);
const STOCK_IDS = new Set(["stockpile-cos", "cos-site", "cos-fd-1", "cos-fd-2", "conv-2", "cos-dozer", "cos-dust", "cos-metal"]);
const CRUSH_IDS = new Set(["crusher", "bunker-cr", "feeder-cr", "conv-1", "crush-site", "cr-bay-1", "cr-bay-2", "cr-breaker", "cr-lube", "cr-motor", "cr-dust", "cr-approach", "feeder-crusher", "aq-crusher"]);
const PLANT_IDS = new Set(["crusher", "stockpile-cos", "mill-sag", "mill-ball", "bunker-cr", "feeder-cr", "conv-1", "conv-2", "cos-fd-1", "cos-fd-2", "cyclone", "slurry-pump-1", "slurry-pump-2",
  "sag-motor", "ball-motor", "flot-rougher", "flot-scav", "flot-clean", "reagents", "thick-conc", "thick-tail", "filter-conc", "tail-pump", "flotation", "plant-sp"]);
export function sceneOf(id) {
  if(T[id]?.attributes?.equipment_class){const a=T[id].attributes;return a.scene==='staff'?sceneOf(a.parent_asset):a.scene;}
  if(T[id]?.attributes?.kind==='person'&&T[id]?.features?.site)return T[id].features.site;
  if(id === "dump")return "dump";
  if(id === "stockpile-rom")return "rom";
  const k = T[id]?.attributes?.kind;
  if (id === "dewatering" || id.startsWith("pump-") || id.startsWith("motor-") || id.startsWith("valve-") || id.startsWith("check-") || id.startsWith("mcc-") ||
      id.startsWith("pl-") || id.startsWith("cb-pump") || id.startsWith("dw-") || ["plc-1", "hmi-1", "lt-1", "lshh-1", "lsll-1", "ft-1", "pt-1"].includes(id)) return "dw";
  if (["mining-face", "excavator", "drill-rig", "haul-truck", "haul-road", "light-tower", "slope-radar", "light-vehicle", "personnel", "person"].includes(k)) return "pit";
  if (id === "aq-pit") return "pit";
  if (WS_IDS.has(id)) return "ws";
  if (FS_IDS.has(id)) return "fs";
  if (GPP_IDS.has(id)) return "gpp";
  if (THK_IDS.has(id)) return "thk";
  if (TLS_IDS.has(id)) return "tls";
  if (TSF_IDS.has(id)) return "tsf";
  if (FLOT_IDS.has(id)) return "flot";
  if (GRIND_IDS.has(id)) return "grind";
  if (STOCK_IDS.has(id)) return "stock";
  if (CRUSH_IDS.has(id)) return "crush";
  if (T[id]?.attributes?.parent === "plant" || PLANT_IDS.has(id)) return "plant";
  return "plan";
}

export function nameOf(id) { return T[id]?.attributes?.name || id; }

// короткий тег для дерева: позиция по паспорту
export function tagOf(id) {
  if (id.startsWith("truck-")) return id.slice(6);
  if (id.startsWith("shovel-")) return id.slice(7);
  if (id.startsWith("drill-")) return id.slice(6);
  if (id.startsWith("face-")) return id.slice(5);
  const m = /^pump-(\d)$/.exec(id); if (m) return `Н-${m[1]}`;
  const mm = /^motor-(\d)$/.exec(id); if (mm) return `М-${mm[1]}`;
  const vs = /^valve-([sd])(\d)$/.exec(id); if (vs) return `${vs[1] === "s" ? "ЗВ" : "ЗН"}-${vs[2]}`;
  const ck = /^check-(\d)$/.exec(id); if (ck) return `ОК-${ck[1]}`;
  const mc = /^mcc-(\d)$/.exec(id); if (mc) return `ШУ-${mc[1]}`;
  const fixed = { "plc-1": "ПЛК-1", "hmi-1": "HMI-1", "lt-1": "LT-1", "lshh-1": "LSHH-1", "lsll-1": "LSLL-1", "ft-1": "FT-1", "pt-1": "PT-1",
    "pl-hdr": "Коллектор", "cb-pump": "Каб. 0,4 кВ", "dw-house": "Насосная",
    "dw-well": "Колодец", "dw-crane": "Кран", dewatering: "Водоотлив", crusher: "ККД", "slope-radar": "Радар" };
  if (fixed[id]) return fixed[id];
  const pl = /^pl-([sd])(\d)$/.exec(id); if (pl) return `${pl[1] === "s" ? "Всас" : "Напор"}-${pl[2]}`;
  const lt = /^light-(\d+)$/.exec(id); if (lt) return `Мачта ${lt[1]}`;
  if (id.startsWith("road-")) return "Дорога";
  return "";
}

// ---- состояние объекта: [уровень, текст]; уровни: ok, warn, alarm, off
export function status(id) {
  const t = T[id]; if (!t) return ["off", ""];
  const f = t.features, k = t.attributes.kind;
  if(id==="dump")return ["ok","принято "+Math.round(f.tonnes||0).toLocaleString("ru-RU")+" т"];
  if(id==="stockpile-rom")return ["ok",f.reclaim_tph>0?"подача "+Math.round(f.reclaim_tph)+" т/ч":"резерв руды"];
  if(t.attributes.equipment_class)return [f.fault?"alarm":f.out_of_service?"off":"ok",f.state||"резерв"];
  const ru = (s) => STATE_RU[s] || s;
  switch (k) {
    case "haul-truck":
      if (f.alarm) return ["alarm", f.alarm];
      if (["repair", "to_ws"].includes(f.state)) return ["alarm", ru(f.state)];
      if (["parked", "blast_hold", "to_shelter", "sheltered"].includes(f.state)) return ["warn", ru(f.state)];
      return ["ok", ru(f.state)];
    case "excavator":
      if (["down", "no_power"].includes(f.state)) return ["alarm", ru(f.state)];
      if (["blast_hold", "blast_prep", "wait_face", "returning"].includes(f.state)) return ["warn", ru(f.state)];
      return ["ok", ru(f.state)];
    case "drill-rig":
      if (f.out_of_service) return ["warn", "в ремонте"];
      return [f.state === "stop" ? "warn" : "ok", ru(f.state)];
    case "mining-face": return f.flooded ? ["alarm", "подтоплен"] : ["ok", f.material || ""];
    case "pump":
      if (f.out_of_service) return ["warn", "в ремонте"];
      if (f.fault) return ["alarm", f.fault];
      return f.running ? ["ok", "работа"] : f.valve_suction ? ["off", "резерв"] : ["warn", "выведен"];
    case "motor": return [f.state === "авария" ? "alarm" : f.state === "в ремонте" ? "warn" : f.state === "работа" ? "ok" : "off", f.state || ""];
    case "motor-cabinet": return [String(f.state).startsWith("авария") ? "alarm" : f.state === "в ремонте" ? "warn" : f.state === "работа" || f.state === "пуск" ? "ok" : "off", f.state || ""];
    case "gate-valve": return [f.open ? "ok" : "warn", f.open ? "открыта" : "закрыта"];
    case "check-valve": return [f.open ? "ok" : "off", f.open ? "поток" : "закрыт"];
    case "level-transmitter": return [f.level_pct > 90 ? "alarm" : f.level_pct > 70 ? "warn" : "ok", `${(+f.level_pct).toFixed(0)} %`];
    case "level-switch": return [f.active ? "alarm" : "ok", f.active ? "сработал" : "норма"];
    case "dewatering": {
      const al = json_(f.alarms);
      return al.some((a) => a.sev === "alarm") ? ["alarm", al[0].text] : al.length ? ["warn", al[0].text] : ["ok", "норма"];
    }
    case "pipeline": case "cable": return [f.state === "в работе" || f.state === "под нагрузкой" ? "ok" : "off", f.state || ""];
    case "haul-road": return f.open === false ? ["alarm", "закрыта"] : f.wet ? ["warn", "мокрая"] : ["ok", "открыта"];
    case "dozer": return [f.out_of_service ? "warn" : f.state === "подгребает" ? "ok" : "off", f.state || ""];
    case "metal-detector": return [f.state === "сработал" ? "alarm" : "ok", f.state || ""];
    case "stockpile-site": return [f.metal_trip_min > 0 ? "warn" : "ok", `подача ${Math.round(f.feeders_cap || 0)} т/ч`];
    case "grinding-site": return [f.service_part ? "warn" : "ok", f.service_part ? `обслуживание: ${f.service_part}` : `предел подачи ${Math.round(f.feed_cap || 0)} т/ч`];
    case "slurry-sump": return [f.level_pct > 90 ? "alarm" : f.level_pct > 80 ? "warn" : "ok", `${Math.round(f.level_pct || 0)} %`];
    case "ball-charger": return [f.charge_pct < 26 ? "alarm" : f.charge_pct < 29 ? "warn" : "ok", `${(+f.charge_pct || 0).toFixed(1)} % · ${f.mode === "auto" ? "авто" : "вручную"}`];
    case "flotation-site": return [f.state === "нет реагента" ? "alarm" : f.service_part ? "warn" : "ok", f.state === "нет реагента" ? "нет реагента" : `извл. ${(+f.recovery || 0).toFixed(0)} % · ${(+f.conc_grade || 0).toFixed(1)} % Cu`];
    case "conditioning": return [f.state === "норма" ? "ok" : "warn", `pH ${(+f.ph || 0).toFixed(1)}`];
    case "blower-station": return [f.state === "авария" ? "alarm" : f.out_of_service ? "warn" : "ok", `${Math.round(f.flow || 0)} м³/мин`];
    case "regrind-mill": return [f.out_of_service ? "warn" : f.state === "работа" ? "ok" : "off", `P80 ${Math.round(f.p80_um || 0)} мкм`];
    case "xrf-analyzer": return [f.state === "дрейф" ? "warn" : "ok", f.state || ""];
    case "thickening-site": return [f.state === "авария" ? "alarm" : f.service_part ? "warn" : "ok", `приём хвостов до ${Math.round(f.cap_tph || 0)} т/ч`];
    case "concentrate-store": return [f.fill_pct > 90 ? "warn" : "ok", f.state === "отгрузка" ? `отгрузка · ${Math.round(f.tonnes || 0)} т` : `${Math.round(f.tonnes || 0)} т`];
    case "tailings-pipeline": return [f.state === "утечка" ? "alarm" : f.velocity_ok === false ? "warn" : f.state === "работа" ? "ok" : "off", f.state === "утечка" ? `утечка ${Math.round(f.leak_m3h)} м³/ч` : `${(+f.velocity || 0).toFixed(2)} м/с`];
    case "barge-pump": return [f.out_of_service ? "warn" : f.state === "авария" ? "alarm" : f.state === "работа" ? "ok" : "off", f.state === "работа" ? `${Math.round(f.flow || 0)} м³/ч` : f.state || ""];
    case "water-well": return [f.state === "работа" ? "ok" : "off", f.state === "работа" ? `${Math.round(f.flow || 0)} м³/ч` : "резерв"];
    case "reagent-store": return [f.state === "пусто" ? "alarm" : Math.min(f.conc_kg ?? 99, (f.tail_kg ?? 999) / 8) < 40 ? "warn" : "ok", `конц. ${Math.round(f.conc_kg || 0)} кг · хвосты ${Math.round(f.tail_kg || 0)} кг`];
    case "pump-station-tank": return [f.state === "переполнение" ? "alarm" : f.level_pct > 80 ? "warn" : "ok", `${Math.round(f.level_pct || 0)} %`];
    case "geotech-monitor": return [f.state === "тревога" ? "alarm" : f.state === "предупреждение" ? "warn" : "ok", `Ку ${(+f.fos || 0).toFixed(2)}`];
    case "water-tank": return [f.level_pct < 15 ? "alarm" : f.level_pct < 30 ? "warn" : "ok", `${Math.round(f.level_pct || 0)} %`];
    case "tailings": return [f.freeboard_m < 1.5 ? "alarm" : f.freeboard_m < 2.2 ? "warn" : "ok", `${(+f.fill_pct || 0).toFixed(0)} % · борт ${(+f.freeboard_m || 0).toFixed(1)} м`];
    case "repair-bay": return [f.state === "закрыт" ? "off" : f.state === "ремонт" ? "warn" : "ok", `${f.state || ""}${f.truck ? " · " + f.truck : ""}`];
    case "spare-parts": return [f.state === "нет запчасти" ? "alarm" : "ok", f.state || ""];
    case "workshop-site": return [f.state === "нет запчасти" ? "alarm" : f.busy >= 3 ? "warn" : "ok", `посты ${f.busy ?? 0}/3 · ремонтов ${f.repairs ?? 0}`];
    case "fuel-tank": return [f.leak ? "alarm" : f.level_pct < 15 ? "alarm" : f.level_pct < 30 ? "warn" : "ok", `${Math.round(f.level_pct || 0)} %`];
    case "fuel-dispenser": return [f.state === "выдача" ? "ok" : "off", f.state || ""];
    case "tanker": return [f.state === "нет поставки" ? "alarm" : f.state === "разгрузка" ? "ok" : "off", f.state || ""];
    case "fuel-site": return [f.state === "утечка" ? "alarm" : f.stock_pct < 25 ? "warn" : "ok", `${Math.round(f.stock_pct || 0)} % · ${Math.round(f.stock_l || 0)} л`];
    case "hv-line": return [f.closed === false ? "alarm" : "ok", f.state || ""];
    case "transformer": return [f.closed === false ? "alarm" : f.load_pct > 110 ? "alarm" : f.load_pct > 85 ? "warn" : "ok", `${Math.round(f.load_pct || 0)} % · ${(+f.load_mw || 0).toFixed(1)} МВт`];
    case "switchgear-section": return [f.state === "обесточена" ? "alarm" : "ok", f.state || ""];
    case "capacitor-bank": return [f.closed === false ? "off" : "ok", f.state || ""];
    case "bus-tie": return [f.closed ? "ok" : "warn", f.state || ""];
    case "gpp-site": return [f.state === "обесточена" ? "alarm" : f.pf < 0.92 ? "warn" : "ok", `${(+f.load_mw || 0).toFixed(1)} МВт · cos φ ${(+f.pf || 0).toFixed(2)}`];
    case "dump-bay": return [f.light === "red" || f.state === "закрыто" ? "warn" : "ok", `${f.state || ""}${f.truck ? " · " + f.truck : ""}`];
    case "rock-breaker": return [f.out_of_service ? "alarm" : f.state === "бьёт негабарит" ? "warn" : "ok", f.state || ""];
    case "lube-system": return [f.state === "авария" || f.temp > 60 ? "alarm" : f.temp > 55 ? "warn" : "ok", `${(+f.temp || 0).toFixed(0)} °C · ${(+f.pressure || 0).toFixed(1)} бар`];
    case "dust-suppression": return [f.state === "работает" ? "ok" : "off", f.state || ""];
    case "crushing-site": return [f.light === "red" ? "warn" : "ok", `светофор: ${({ green: "зелёный", yellow: "жёлтый", red: "красный" })[f.light] || ""}`];
    case "bunker": return [f.fill_pct > 90 ? "warn" : "ok", `${Math.round(f.fill_pct)} %`];
    case "hydrocyclone": return [f.out_of_service ? "warn" : f.plugged > 0 || f.pressure_bar > 1.3 ? "warn" : f.state === "работа" ? "ok" : "off", f.out_of_service ? "обслуживание" : f.plugged > 0 ? `забито: ${f.plugged}` : f.state || ""];
    case "flotation-bank": return [f.out_of_service ? "warn" : f.state === "работа" ? "ok" : "off", f.out_of_service ? `кам. ${f.cells}` : `${f.state} · кам. ${f.cells ?? "—"}`];
    case "reagent-station": return [f.state === "нет реагента" ? "alarm" : f.state === "норма" ? "ok" : "warn", f.state || ""];
    case "thickener": return [f.out_of_service ? "warn" : f.torque_pct > 80 ? "alarm" : f.torque_pct > 65 ? "warn" : f.state === "работа" ? "ok" : "off", `${f.state || ""} · момент ${Math.round(f.torque_pct || 0)} %`];
    case "filter-press": return [f.out_of_service ? "warn" : f.moisture > 10.5 ? "warn" : f.state === "работа" ? "ok" : "off", `${f.phase || f.state || ""} · ${(+f.moisture || 0).toFixed(1)} %`];
    case "plate-feeder": case "conveyor": case "slurry-pump": case "flotation-bank": case "thickener": case "filter-press":
      return [f.state === "авария" ? "alarm" : f.state === "в ремонте" ? "warn" : f.state === "работа" ? "ok" : "off", f.state || ""];
    case "reagent-station": return [f.state === "норма" ? "ok" : "warn", f.state || ""];
    case "gyratory-crusher": return [f.state === "run" ? "ok" : "alarm", ru(f.state)];
    case "sag-mill": case "ball-mill": return [f.out_of_service || f.state === "service" ? "warn" : f.state === "run" ? "ok" : f.state === "ramp" ? "warn" : "alarm", f.out_of_service ? "перефутеровка" : ru(f.state)];
    case "slope-radar": return [f.tarp === "тревога" ? "alarm" : f.tarp === "внимание" ? "warn" : "ok", f.tarp || ""];
    case "air-monitor": return [f.pm10 > 150 ? "alarm" : f.pm10 > 50 ? "warn" : "ok", `PM10 ${Math.round(f.pm10)}`];
    case "feeder": return [f.on ? "ok" : "alarm", f.on ? "под напряжением" : "обесточен"];
    case "substation": return [f.grid === false ? "alarm" : f.shedding ? "warn" : "ok", f.grid === false ? "нет сети" : f.shedding ? "ограничение" : "норма"];
    case "fuel-station": return [f.fill_pct < 15 ? "alarm" : f.fill_pct < 30 ? "warn" : "ok", `${Math.round(f.fill_pct)} %`];
    case "person": return [f.in_blast_zone ? "alarm" : f.battery < 15 ? "warn" : "ok", f.zone || ""];
    case "personnel": case "light-vehicle": return [f.state === "blocked" ? "alarm" : "ok", f.task || ""];
    case "light-tower": return [f.on ? "ok" : "off", f.on ? "включена" : "выключена"];
    case "building": case "intake-well": case "crane": return [f.state === "норма" || f.state === "в парке" ? "ok" : "warn", f.state || ""];
    case "plc": case "hmi-panel": return ["ok", f.mode || f.state || ""];
    default: return ["ok", f.state ? ru(f.state) : ""];
  }
}
function json_(s) { try { return JSON.parse(s ?? "[]"); } catch { return []; } }

// ---- положение объекта: [x, y, z] в координатах рудника, м
export function posOf(id) {
  const t = T[id]; if (!t) return null;
  const f = t.features, a = t.attributes;
  if (f.x != null && f.y != null) return [f.x, f.y, f.z ?? 0];
  if (a.x != null && a.y != null) return [a.x, a.y, a.z ?? a.bench_z_m ?? 0];
  if (id.startsWith("shovel-")) { const fa = T[`face-${["F1", "F2", "F3"][+id.slice(10) - 1]}`]?.attributes; if (fa) return [fa.x, fa.y, fa.bench_z_m]; }
  const site = siteInfo();
  if (site) {
    const h = site.house, hx = (h.x0 + h.x1) / 2, z = -90;
    const py = site.pump_y;
    let m;
    if ((m = /^(?:pump|motor|valve-[sd]|check|mcc)-?(\d)$/.exec(id.replace("valve-s", "valve-s").replace("valve-d", "valve-d")))) return [hx, py[+m[1] - 1], z];
    if (id === "dewatering" || id === "dw-house" || id === "plc-1" || id === "hmi-1" || id === "ft-1" || id === "pt-1") return [hx, 0, z];
    if (id === "dw-well" || id === "lt-1" || id === "lsll-1") return [(site.well.x0 + site.well.x1) / 2, 0, z];
    if (id === "lshh-1") return [site.bowl.xc + 5, 12, z];
    if (id === "pl-hdr") return [hx - 4, 0, z];
    if (id.startsWith("pl-")) return [hx, py[+id.slice(4) - 1] ?? 0, z];
  }
  if (id === "slope-radar") return null;
  return null;
}

let siteCache = null;
export function siteInfo() {
  if (siteCache) return siteCache;
  const s = T.dewatering?.attributes?.site;
  if (!s) return null;
  try { siteCache = JSON.parse(s); } catch { siteCache = null; }
  return siteCache;
}

// ---- перечень объектов для дерева
let cache = { n: -1, list: [] };
export function objects() {
  const names = Object.keys(T);
  if (cache.n === names.length) return cache.list;
  const out = [];
  for (const id of names) {
    const a = T[id].attributes, k = a.kind;
    if (!k || HIDDEN.has(k)) continue;
    const g = a.equipment_class ? a.scene : id === "stockpile-rom" ? "rom" : WS_IDS.has(id) ? "ws" : FS_IDS.has(id) ? "fs" : GPP_IDS.has(id) ? "gpp" : THK_IDS.has(id) ? "thk" : TLS_IDS.has(id) ? "tls" : TSF_IDS.has(id) ? "tsf" : FLOT_IDS.has(id) ? "flot" : GRIND_IDS.has(id) ? "grind" : STOCK_IDS.has(id) ? "stock" : CRUSH_IDS.has(id) ? "crush" : GROUP_OF[k];
    if (!g) continue;
    out.push({ id, kind: k, group: g, name: a.name || id, tag: tagOf(id), scene: sceneOf(id) });
  }
  out.sort((x, y) => (x.id.length - y.id.length) || x.id.localeCompare(y.id, "ru", { numeric: true }));
  cache = { n: names.length, list: out };
  return out;
}

export function people() {
  return Object.keys(T).filter((n) => /^p-\d+$/.test(n)).sort().map((id) => ({ id, ...T[id].attributes, f: T[id].features }));
}

export function short(id) {
  const t = T[id]; if (!t) return "";
  const f = t.features, k = t.attributes.kind;
  const n = (x, d = 0) => (x == null ? "—" : (+x).toLocaleString("ru-RU", { maximumFractionDigits: d }));
  switch (k) {
    case "haul-truck": return f.payload > 1 ? `${n(f.payload)} т · ${f.destination || ""}` : `${n(f.speed)} км/ч`;
    case "excavator": return `очередь ${n(f.queue)} · ${n(f.dig_rate)} т/ч`;
    case "pump": return f.running ? `${n(f.flow)} м³/ч · ${n(f.current)} А` : "";
    case "level-transmitter": return `${n(f.level_m, 2)} м`;
    case "mining-face": return `${n(f.cu, 2)} % Cu`;
    case "pipeline": return f.flow ? `${n(f.flow)} м³/ч` : "";
    default: return "";
  }
}
