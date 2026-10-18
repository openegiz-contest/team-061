"""Local durable simulator state. SQLite FULL/WAL + two generations + atomic backup.
Only locally generated, checksummed, allow-listed snapshots are restored.
"""
import hashlib,io,json,logging,os,pickle,random,shutil,sqlite3,time,zlib
from contextlib import contextmanager,closing
from pathlib import Path
FORMAT=1
log=logging.getLogger('kentash')
class StateError(RuntimeError):pass
class IncompatibleState(StateError):pass
ALLOWED={'model':{'Mine','Face','Shovel','Truck'},'random':{'Random'},'collections':{'deque'},'dewatering':{'Dewatering','Pump'},'personnel':{'Personnel','Mover','Person'},'crews':{'Walker'},'maintenance':{'Maint'},'workforce':{'Workforce'}}
class Reader(pickle.Unpickler):
    def find_class(self,module,name):
        if name not in ALLOWED.get(module,set()):raise StateError('Недопустимый класс в сохранении: '+module+'.'+name)
        return super().find_class(module,name)
def signature():
    import geometry as G,equipment as E
    data={'nodes':G.GRAPH.nodes,'edges':[(list(k),e['pts'])for k,e in sorted(G.GRAPH.edges.items())],'equipment':E.SPECS}
    return hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest()
def sync_dir(path):
    fd=os.open(str(path),os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)
class StateStore:
    def __init__(self,path):
        self.path=Path(path);self.backup=self.path.with_suffix('.backup.sqlite');self.path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        self.fingerprint=signature();self.recovered=False;self.saved_at=None;self.backup_error=''
    @contextmanager
    def connect(self,path=None,readonly=False):
        target=Path(path or self.path)
        c=sqlite3.connect('file:'+str(target)+'?mode=ro' if readonly else str(target),uri=readonly,timeout=10)
        if not readonly:
            c.execute('PRAGMA synchronous=FULL');c.execute('PRAGMA journal_mode=WAL')
            version=c.execute('PRAGMA user_version').fetchone()[0]
            if version not in (0,FORMAT):c.close();raise IncompatibleState('Неподдерживаемая версия базы сохранений')
            c.execute('CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, format INTEGER NOT NULL, fingerprint TEXT NOT NULL, created REAL NOT NULL, sim_t REAL NOT NULL, seq INTEGER NOT NULL, digest TEXT NOT NULL, payload BLOB NOT NULL)')
            c.execute('CREATE TABLE IF NOT EXISTS commands (seq INTEGER PRIMARY KEY, payload TEXT NOT NULL)')
            c.execute('PRAGMA user_version='+str(FORMAT));c.commit();os.chmod(target,0o600)
        try:
            with c:yield c
        finally:c.close()
    def decode(self,row):
        version,fingerprint,created,sim_t,seq,digest,blob=row
        if version!=FORMAT or fingerprint!=self.fingerprint:raise IncompatibleState('Изменилась схема или геометрия модели: требуется миграция сохранения')
        if hashlib.sha256(blob).hexdigest()!=digest:raise StateError('Повреждена контрольная сумма сохранения')
        raw=zlib.decompress(blob)
        if len(raw)>64*1024*1024:raise StateError('Слишком большое сохранение')
        value=Reader(io.BytesIO(raw)).load()
        if value['seq']!=seq or value['model'].t!=sim_t:raise StateError('Метаданные сохранения не совпадают')
        if value['model'].workforce.model is not value['model']:raise StateError('Повреждены ссылки модели')
        return value
    def read(self,path):
        with self.connect(path,readonly=True) as c:
            rows=c.execute('SELECT format,fingerprint,created,sim_t,seq,digest,payload FROM snapshots ORDER BY id DESC').fetchall()
        if not rows:return None
        for i,row in enumerate(rows):
            try:
                value=self.decode(row);self.recovered=i>0;self.saved_at=row[2];return value
            except IncompatibleState:raise
            except Exception as exc:log.error('Повреждена контрольная точка: %s',exc)
        raise StateError('Нет исправной контрольной точки')
    def load(self):
        if not self.path.exists() and not self.backup.exists():return None
        try:value=self.read(self.path)
        except IncompatibleState:raise
        except Exception as exc:
            if not self.backup.exists():raise StateError('Сохранение недоступно; автоматический сброс запрещён') from exc
            value=self.read(self.backup)
            if value is None:raise StateError('Резервная копия пуста')
            stamp=str(time.time_ns())
            for file in [self.path,Path(str(self.path)+'-wal'),Path(str(self.path)+'-shm')]:
                if file.exists():file.rename(str(file)+'.corrupt-'+stamp)
            tmp=self.path.with_suffix('.restore.tmp');shutil.copyfile(self.backup,tmp)
            with tmp.open('rb')as f:os.fsync(f.fileno())
            os.replace(tmp,self.path);sync_dir(self.path.parent);self.recovered=True
            log.warning('Восстановлена резервная база сохранений: %s',exc)
        if value is None and self.backup.exists():raise StateError('Пустая основная база при существующей резервной: автоматический сброс запрещён')
        if value is not None:random.setstate(value['random'])
        return value
    def enqueue(self,command):
        seq=command.get('seq')
        if not isinstance(seq,int) or isinstance(seq,bool) or seq<0:raise ValueError('Неверный номер команды')
        body=json.dumps(command,ensure_ascii=False,sort_keys=True)
        with self.connect()as c:
            prior=c.execute('SELECT payload FROM commands WHERE seq=?',(seq,)).fetchone()
            if prior:
                if prior[0]!=body:raise ValueError('Разные команды с одинаковым номером')
                return False
            c.execute('INSERT INTO commands VALUES (?,?)',(seq,body))
        return True
    def pending(self,after):
        with self.connect(readonly=True)as c:return [json.loads(r[0])for r in c.execute('SELECT payload FROM commands WHERE seq>? ORDER BY seq LIMIT 100',(after,))]
    def save(self,model,seq,carry=0.):
        value={'model':model,'seq':seq,'carry':carry,'random':random.getstate()}
        blob=zlib.compress(pickle.dumps(value,protocol=5),3);digest=hashlib.sha256(blob).hexdigest();created=time.time()
        # Model state and command acknowledgement become durable in the same commit.
        with self.connect()as c:
            c.execute('INSERT INTO snapshots(format,fingerprint,created,sim_t,seq,digest,payload) VALUES (?,?,?,?,?,?,?)',(FORMAT,self.fingerprint,created,model.t,seq,digest,blob))
            c.execute('DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 2)')
            lowest=c.execute('SELECT min(seq) FROM snapshots').fetchone()[0]
            c.execute('DELETE FROM commands WHERE seq<=?',(lowest,))
        self.saved_at=created
        # A separate coherent SQLite file also survives physical damage to the primary database.
        tmp=self.backup.with_suffix('.tmp')
        try:
            with self.connect(readonly=True)as src,closing(sqlite3.connect(tmp))as dst:src.backup(dst)
            with tmp.open('rb')as f:os.fsync(f.fileno())
            os.chmod(tmp,0o600);os.replace(tmp,self.backup);sync_dir(self.path.parent);self.backup_error=''
        except (OSError,sqlite3.Error)as exc:
            self.backup_error=str(exc);log.error('Не удалось обновить резервную копию; основная точка сохранена: %s',exc)
        return created
