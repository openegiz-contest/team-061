#!/usr/bin/env bash
# Ждём, пока симулятор создаст двойники и Стенд получит данные из Ditto через свой прокси.
set -u
port=$(grep -E '^MINE_PORT=' deploy/compose/.env 2>/dev/null | cut -d= -f2); port=${port:-8200}
prev=-1; stable=0
for i in $(seq 1 120); do
  n=$(curl -s "http://127.0.0.1:${port}/ditto/api/2/search/things/count?namespaces=kz.kentash" 2>/dev/null || true)
  # симулятор создаёт сотни двойников несколько минут: ждём, пока их число перестанет расти (три одинаковых замера подряд)
  if [[ "$n" =~ ^[0-9]+$ ]] && (( n >= 55 )) && [[ "$n" == "$prev" ]]; then stable=$((stable+1)); else stable=0; fi
  prev=$n
  if (( stable >= 3 )); then
    echo "Рудник «Кенташ» запущен: двойников в Ditto — ${n}."
    echo "  Стенд (3D-рудник, сценарии «что если», модули):  http://localhost:${port}"
    echo "  Grafana (дашборд «Рудник Кенташ», двойники):      http://localhost:$(grep -E '^GRAFANA_PORT=' deploy/compose/.env | cut -d= -f2 || echo 3000)"
    exit 0
  fi
  sleep 5
done
echo "ОШИБКА: двойники рудника не созданы в Ditto за 10 мин. Журнал: make logs S=kentash-sim" >&2
exit 1
