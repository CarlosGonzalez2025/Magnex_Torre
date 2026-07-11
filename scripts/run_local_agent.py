"""Puente stdin/stdout para ejecutar api.agent desde el servidor local Node."""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from api.agent import run_agent


def main():
    payload = json.loads(sys.stdin.read() or '{}')
    messages = payload.get('messages') or []
    if not isinstance(messages, list) or not messages:
        print(json.dumps({'error': 'Falta el historial de mensajes.'}, ensure_ascii=False))
        return
    print(json.dumps(run_agent(messages), ensure_ascii=False))


if __name__ == '__main__':
    main()
