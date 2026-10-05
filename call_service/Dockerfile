FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
RUN pip install 'telethon==1.45.0' 'py-tgcalls==3.0.0' 'ntgcalls==3.0.1'
RUN useradd --create-home runner
COPY group_calls.py ./
COPY call_service/empty_policy.py ./call_service/empty_policy.py
USER runner
CMD ["python", "group_calls.py"]
