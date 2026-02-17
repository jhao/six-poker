FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV APP_PORT=5000 \
    ADMIN_USERNAME=admin \
    ADMIN_PASSWORD=admin \
    ALLOWED_CREATORS= \
    ALLOWED_CREATORS_FILE=/data/allowed_creators.json

EXPOSE 5000

CMD ["sh", "-c", "python app.py --host 0.0.0.0 --port ${APP_PORT} --admin-username \"${ADMIN_USERNAME}\" --admin-password \"${ADMIN_PASSWORD}\" --allowed-creators \"${ALLOWED_CREATORS}\" --allowed-creators-file \"${ALLOWED_CREATORS_FILE}\""]
