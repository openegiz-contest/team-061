# Данные и их лицензии

Все наборы лежат в `mine/data/` и загружаются симулятором при запуске (внешние загрузки не нужны). Лицензии
наборов разрешают распространение копий. Каждый набор сохраняет собственную лицензию, код решения распространяется по MIT.

| Набор | Где в репозитории | Лицензия | Изменения | Как используется |
|---|---|---|---|---|
| **GeoMet dataset** — Hoffimann J., Augusto J., Resende L. и др., Zenodo, [10.5281/zenodo.7051975](https://doi.org/10.5281/zenodo.7051975) | `mine/data/geomet/` (`drillholes.csv`, `comminution.csv`, `flotation.csv`) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | без изменений | Блочная модель: координаты проб переносятся на карьер линейным преобразованием (`geology.py`). Отсюда содержание Cu, S, Au; индекс измельчаемости M → крепость и удельная энергия; лабораторное извлечение LCT → извлечение во флотации |
| **Fragmentation from 3D drone image analysis in El Aljibe quarry** — Segarra P., Sanchidrián J. A. и др., Zenodo, [10.5281/zenodo.10666378](https://doi.org/10.5281/zenodo.10666378) | `mine/data/fragmentation/MSA_B*.txt` | CC BY 4.0 | без изменений | Медиана P80 двенадцати взрывов — база кусковатости «нормального» взрыва; разброс — диапазон случайного отклонения |
| **MWD dataset with rock type labels for 15 Norwegian hard rock tunnels** — Hansen T. F., Zenodo, [10.5281/zenodo.10358374](https://doi.org/10.5281/zenodo.10358374) | `mine/data/mwd/mwd_rocktype_blastholes_model_ready_full.csv` | CC BY 4.0 | без изменений (используется один файл из четырёх) | Распределение нормированной скорости проходки → разброс скорости бурения станков |
| **Energy consumption data of a mining and processing plant** — Tytiuk V., Lytvynchuk O., Busher V. и др., Zenodo, [10.5281/zenodo.20647907](https://doi.org/10.5281/zenodo.20647907) | `mine/data/energy/EnergyConsumptionData.xlsx` (исходный), `mine/data/energy/profile.csv` (производный) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | `profile.csv` получен скриптом `prepare.py`: сумма итоговых точек учёта всех ГПП, среднее по дням для каждого 30-минутного интервала, нормировка. `profile.csv` распространяется на тех же условиях CC BY-SA 4.0 | Суточная форма графика и соотношение «зима/лето» для вспомогательных потребителей ГПП |
| **OpenMines, north_pit_mine.json** — [370025263/openmines](https://github.com/370025263/openmines) | `mine/data/openmines/` (с файлом `LICENSE`) | MIT | без изменений | Ориентир для проверки правдоподобия: средняя скорость самосвалов реального карьера (тест `test_speed_vs_openmines`) |

Остальные наборы со страницы «Данные» не используются:
- метан и сейсмические удары относятся к подземным рудникам, а «Кенташ» — открытый карьер;
- флотация с Kaggle требует учётной записи;
- вибрация дробилки — 9,8 ГБ.

Синтетические параметры (паспорта техники, тарифы, цены) описаны в разделе «Данные и допущения» файла [SUBMISSION.md](SUBMISSION.md).
