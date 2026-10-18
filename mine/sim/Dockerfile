FROM python:3.12-slim
WORKDIR /app/sim
COPY sim/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY sim/*.py ./
COPY data /app/data
ENV MINE_DATA=/app/data PYTHONUNBUFFERED=1
RUN mkdir -p /app/state && chown nobody:nogroup /app/state
ENV STATE_PATH=/app/state/state.sqlite CHECKPOINT_SECONDS=15
USER nobody
# на пустом томе создание двойников в Ditto и расчёт геометрии занимают несколько минут: до первой контрольной точки сбои не считаются
HEALTHCHECK --interval=30s --timeout=5s --start-period=480s --retries=3 CMD ["python", "healthcheck.py"]
CMD ["python", "main.py"]
