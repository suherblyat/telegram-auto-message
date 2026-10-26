FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
RUN pip install 'telethon==1.45.0' 'py-tgcalls==3.0.0' 'ntgcalls==3.0.1' 'cryptography==46.0.3'
RUN useradd --create-home runner
COPY group_calls.py ./
COPY call_service/ ./call_service/
COPY tests/test_summary_range.py ./tests/test_summary_range.py
RUN PYTHONPATH=/app python -m unittest discover -s tests -p test_summary_range.py
USER runner
CMD ["python", "group_calls.py"] 
