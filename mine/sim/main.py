#!/usr/bin/env python3
"""Сервис-симулятор рудника «Кенташ» на платформе OpenEgiz.

1. Создаёт (идемпотентно) двойники рудника в Eclipse Ditto.
2. Считает модель с шагом 1 модельная секунда, ускоренно относительно реального времени.
3. Публикует состояние двойников в MQTT (telemetry/<двойник>) командами Ditto protocol «modify /features»:
   Ditto обновляет двойники, Telegraf пишет историю в InfluxDB, интерфейс и Grafana читают из платформы.
4. Принимает команды Стенда через двойник control: интерфейс меняет его свойство в Ditto, Ditto публикует событие
   в MQTT (opentwins/...), симулятор применяет сценарий «что если» или режим.
"""
import base64
import json
import logging
import os
import signal
import threading
from checkpoint import StateStore
import sys
import time
import uuid
import urllib.error
import urllib.request

import paho.mqtt.client as mqtt

import crushing as CRUSH
import facilities as FAC
import forecast as FC
import flotation as FLOT
import thickening as THK
import grinding as GRIND
import stockpile as STOCK
import model as M
import scenarios as SC
import twins as T

log = logging.getLogger("kentash")
DITTO_URL = os.environ.get("DITTO_URL", "http://localhost:8080").rstrip("/")
AUTH = "Basic " + base64.b64encode(f"{os.environ.get('DITTO_USER', 'ditto')}:{os.environ.get('DITTO_PASSWORD', '')}".encode()).decode()
MQTT_HOST = os.environ.get("MQTT_HOST", "localhost")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
SPEED = float(os.environ.get("SIM_SPEED", "5"))


def ditto(method, path, body=None, timeout=10):
    req = urllib.request.Request(f"{DITTO_URL}/api/2{path}", data=None if body is None else json.dumps(body).encode(),
                                 method=method, headers={"Authorization": AUTH, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
        return r.status, (json.loads(data) if data else None)


def create_twins(m,stop=None):
    m.trail.clear()                                    # после восстановления следы не публикуем: они могут превысить предел двойника
    defs = T.definitions(m)
    snap = T.snapshot(m)
    for thing_id, body in defs.items():
        name = thing_id.split(":", 1)[1]
        if name != "control":
            body = {**body, "features": {k: {"properties": v} for k, v in snap.get(name, {}).items()}}
        for attempt in range(40):
            if stop and stop.is_set():return None
            try:
                if name == "control":           # пульт не перезаписываем, если он уже есть: в нём могут быть команды
                    try:
                        ditto("GET", f"/things/{thing_id}")
                        break
                    except urllib.error.HTTPError as e:
                        if e.code != 404:
                            raise
                ditto("PUT", f"/things/{thing_id}", body)
                break
            except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
                if attempt == 39:
                    raise
                log.warning("Ditto не готов (%s), двойник %s, %d байт, повтор", exc, thing_id, len(json.dumps(body, ensure_ascii=False).encode()) if not isinstance(body, (bytes, str)) else len(body))
                if stop:stop.wait(3)
                else:time.sleep(3)
    # двойники, которых больше нет в модели (например, после смены геометрии или парка), удаляются из Ditto
    try:
        cursor, stale = "", []
        while True:
            _, res = ditto("GET", f"/search/things?namespaces={T.NS}&fields=thingId&option=size(200){',cursor(' + cursor + ')' if cursor else ''}")
            stale += [it["thingId"] for it in res.get("items", []) if it["thingId"] not in defs]
            cursor = res.get("cursor") or ""
            if not cursor:
                break
        for thing_id in stale:
            ditto("DELETE", f"/things/{thing_id}")
            log.info("удалён устаревший двойник %s", thing_id)
    except (urllib.error.URLError, TimeoutError, KeyError) as exc:
        log.warning("не удалось проверить устаревшие двойники: %s", exc)
    # Commit the geometry generation only after all road and equipment passports are consistent.
    version = defs[T.tid("pit")]["attributes"].get("geometry_version", 1)
    ditto("PUT", f"/things/{T.tid('mine')}/attributes/run_id", uuid.uuid4().hex)
    ditto("PUT", f"/things/{T.tid('mine')}/attributes/geometry_ready", version)
    log.info("двойников в Ditto: %d; геометрия %s готова", len(defs), version)
    return defs


class Sim:
    def __init__(self):
        self.store=StateStore(os.environ.get('STATE_PATH','/app/state/state.sqlite'))
        state=self.store.load()
        self.exact_restore=state is not None
        self.m=state['model'] if state else M.Mine()
        import shifts,economy,safety
        shifts.ensure(self.m);economy.ensure(self.m);safety.tick(self.m)
        if not state:self.m.speed=SPEED
        self.seq=state['seq'] if state else -1
        self.carry=state.get('carry',0.) if state else 0.
        self.client=None;self.stop=threading.Event();self.command_error=None
        self.fc=FC.Forecaster()
        if state:log.info('Точное восстановление: t=%.1f, seq=%d, резерв=%s',self.m.t,self.seq,self.store.recovered)

    # ------------------------------------------------------------ команды Стенда
    def on_message(self, client, userdata, msg):
        try:
            ev = json.loads(msg.payload)
        except ValueError:
            return
        value = ev.get("value")
        path = ev.get("path", "")
        # событие изменения двойника control: интересует свойство features/command/properties
        cmd = None
        if path.startswith("/features/command/properties"):
            cmd = value if path.endswith("/properties") else None
        elif path in ("/features/command", "/features"):
            cmd = (value or {}).get("properties") if path.endswith("command") else ((value or {}).get("command") or {}).get("properties")
        elif path == "/":
            cmd = (((value or {}).get("features") or {}).get("command") or {}).get("properties")
        if isinstance(cmd,dict) and isinstance(cmd.get('seq'),int) and cmd['seq']>self.seq:
            try:self.store.enqueue(cmd)
            except Exception as exc:
                self.command_error=exc;log.critical('Команда не записана в журнал: %s',exc)


    def apply(self, cmd):
        if cmd.get("seq",-1)<=self.seq:return
        self.seq = cmd["seq"]
        v = cmd.get("value") if isinstance(cmd.get("value"), dict) else cmd
        kind = v.get("cmd")
        m = self.m
        try:
            if kind == "scenario":
                SC.apply(m, v["id"], bool(v.get("on", True)), v.get("params") or {})
            elif kind == "speed":
                m.speed = max(0.0, min(30.0, float(v["value"])))
                m.log("info", f"Скорость модели: ×{m.speed:g}")
            elif kind == 'safety_ack':
                import safety
                safety.acknowledge(m)
            elif kind == "chain_control":
                import chain
                chain.command(m,v.get("action"))
            elif kind == "production_plan":
                import production as P
                if not P.command(m,v):m.log("warn","План: значения вне допустимых границ")
            elif kind == "dispatch_mode":
                m.dispatch_mode = "fixed" if v.get("value") == "fixed" else "dynamic"
                m.decide("Диспетчеризация", "Режим: " + ("жёсткое закрепление самосвалов за экскаваторами" if m.dispatch_mode == "fixed" else "динамическое распределение по времени цикла"))
            elif kind == "grade_target":
                m.grade_target = max(0.3, min(1.0, float(v["value"])))
                m.decide("Геология и качество руды", f"Целевое содержание Cu в питании фабрики: {m.grade_target:.2f} %")
            elif kind == "mill_sp":
                m.mill_sp = max(600.0, min(2300.0, float(v["value"])))
                m.log("info", f"Задание производительности фабрики: {m.mill_sp:.0f} т/ч")
            elif kind in ("pump", "pump_valve", "dewater_mode", "dewater_sp"):
                m.dw.command(m, v)
            elif kind == "plant_set":
                key = v.get("key")
                lim = {"css": (140.0, 220.0), "collector": (5.0, 60.0), "frother": (5.0, 30.0)}
                if key in lim:
                    m.plant_sp[key] = max(lim[key][0], min(lim[key][1], float(v["value"])))
                    m.decide("Переработка", f"Уставка «{ {'css': 'щель ККД, мм', 'collector': 'собиратель, г/т', 'frother': 'вспениватель, г/т'}[key] }»: {m.plant_sp[key]:g}")
            elif kind == "crush":
                CRUSH.command(m, v)
            elif kind == "stock":
                STOCK.command(m, v)
            elif kind == "grind":
                GRIND.command(m, v)
            elif kind == "flot":
                FLOT.command(m, v)
            elif kind == "product_quality":
                import concentrate_quality as CQ
                CQ.command(m,v)
            elif kind == "thick":
                THK.command(m, v)
            elif kind == "fuel":
                FAC.fs_command(m, v)
            elif kind == "gpp":
                FAC.gpp_command(m, v)
            elif kind == "ws":
                FAC.ws_command(m, v)
            elif kind == "maint":
                m.maint.command(m, v)
            elif kind == "ping":
                pe = next((x for x in m.persons if x.id == v.get("id")), None)
                if pe:
                    m.log("info", f"Диспетчер вызвал на связь: {pe.role} ({pe.tag}), зона «{pe.zone}»")
            elif kind == "steady":
                import steady
                steady.restore(m)
            elif kind == "forecast":
                if v.get("action") == "cancel":self.fc.cancel(m)
                else:self.fc.start(m, v)
            elif kind == "reset":
                for a in SC.active(m):
                    SC.apply(m, a["id"], False, a["params"])
                m.log("ok", "Все сценарии отменены, рудник в штатном режиме")
            log.info("команда Стенда: %s", v)
        except (KeyError, ValueError, TypeError) as exc:
            m.log("warn", f"Команда не принята: {v} ({exc})")

    # ------------------------------------------------------------ публикация
    def run(self):
        signal.signal(signal.SIGTERM,lambda *_:self.stop.set())
        signal.signal(signal.SIGINT,lambda *_:self.stop.set())
        interval=max(1.,float(os.environ.get('CHECKPOINT_SECONDS','15')))
        try:
            if not self.exact_restore:
                import resume
                restored=resume.restore(self.m,ditto)
                if not restored:
                    for _ in range(2*3600):self.m.step(1.)
                try:
                    _,baseline=ditto('GET',f"/things/{T.tid('control')}/features/command/properties")
                    self.seq=(baseline or {}).get('seq',-1)
                except urllib.error.HTTPError as exc:
                    if exc.code!=404:raise
            self.store.save(self.m,self.seq,self.carry)
            if create_twins(self.m,self.stop) is None:return
            # MQTT reconnects independently; disconnects never build a telemetry backlog.
            c=mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,client_id=f'kentash-sim-{os.getpid()}')
            c.on_message=self.on_message
            c.on_connect=lambda cl,*_:cl.subscribe(f'opentwins/+/+/{T.NS}/control',qos=1)
            c.reconnect_delay_set(min_delay=1,max_delay=30)
            c.connect_async(MQTT_HOST,MQTT_PORT,keepalive=30);c.loop_start();self.client=c
            from telemetry import Publisher
            publisher=Publisher(c,T.NS,self.m,float(os.environ.get('TELEMETRY_MAX_HZ','20')))
            try:
                _,cur=ditto('GET',f"/things/{T.tid('control')}/features/command/properties")
                if cur and cur.get('seq',-1)>self.seq:
                    self.store.enqueue(cur)
            except (urllib.error.URLError,TimeoutError):pass
            log.info('Сохранение каждые %.0f с; телеметрия не более %.0f сообщений/с',interval,publisher.hz)
            previous=last_save=time.monotonic()
            while not self.stop.is_set():
                now=time.monotonic();elapsed=now-previous;previous=now
                if self.command_error:raise RuntimeError('Журнал команд недоступен')from self.command_error
                for cmd in self.store.pending(self.seq):
                    self.apply(cmd)
                    self.store.save(self.m,self.seq,self.carry)
                    last_save=time.monotonic()
                self.carry+=elapsed*self.m.speed
                count=min(int(self.carry),300);self.carry-=count
                for _ in range(count):self.m.step(1.)
                self.fc.poll(self.m)
                if now-last_save>=interval:
                    self.store.save(self.m,self.seq,self.carry);last_save=now
                if now-publisher.last_sample>=1.:
                    snapshot=T.snapshot(self.m)
                    snapshot['forecast']=self.fc.view()
                    snapshot['mine'].update(telemetry_unix=T._f(time.time(),'с',3),checkpoint_unix=T._f(self.store.saved_at,'с',3),checkpoint_ok=T._f(not bool(self.store.backup_error)))
                    publisher.sample(snapshot,now)
                publisher.flush(now)
                self.stop.wait(.1)
        finally:
            self.fc.cancel()
            if self.client:self.client.loop_stop();self.client.disconnect()
            if self.stop.is_set() and self.command_error is None:
                self.store.save(self.m,self.seq,self.carry)
                log.info('Состояние сохранено при остановке: t=%.1f, seq=%d',self.m.t,self.seq)
            else:log.error('Аварийная остановка: оставлена последняя целая контрольная точка')


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sys.exit(Sim().run())
