FROM python:3.11-slim

WORKDIR /app

RUN pip install fastapi uvicorn httpx

COPY mcp_wrapper.py .

EXPOSE 9000

CMD ["python", "mcp_wrapper.py"]
