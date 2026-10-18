"""Container liveness requires a recent, readable durable checkpoint."""
import os,sqlite3,time
from pathlib import Path
def check(path,now=None,interval=15):
    now=time.time()if now is None else now
    try:
        with sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True,timeout=3)as db:
            if db.execute('PRAGMA quick_check(1)').fetchone()[0]!='ok':return False,'Повреждена база состояния'
            row=db.execute('SELECT max(created) FROM snapshots').fetchone()
        if not row[0] or now-row[0]>max(90,interval*4):return False,'Контрольная точка устарела'
        backup=Path(path).with_suffix('.backup.sqlite')
        if not backup.exists()or now-backup.stat().st_mtime>max(120,interval*5):return False,'Резервная копия устарела'
        return True,'Контрольная точка и резервная копия актуальны'
    except (OSError,sqlite3.Error):return False,'База состояния недоступна'
if __name__=='__main__':
    ok,message=check(os.environ.get('STATE_PATH','/app/state/state.sqlite'),interval=float(os.environ.get('CHECKPOINT_SECONDS','15')))
    print(message);raise SystemExit(0 if ok else 1)
