#!/usr/bin/env bash
# Arranque y parada de la API para desarrollo y pruebas.
#
# Por qué existe este script en lugar de un `npx tsx &` suelto:
#
#   1. `npx tsx` crea un árbol de procesos (npm exec -> tsx -> node). El `$!` de
#      bash es el PID de `npm exec`, NO el del proceso node que escucha el
#      puerto, así que un pidfile guardado con `$!` no sirve para parar nada.
#   2. Parar con `pkill -f "tsx src/index.ts"` es un error: ese patrón también
#      coincide con el shell que ejecuta el script, que se mata a sí mismo.
#   3. Si el puerto ya está ocupado, el proceso nuevo muere con EADDRINUSE y el
#      viejo sigue sirviendo código viejo sin que nadie se entere: es muy fácil
#      creer que se ha reiniciado la API cuando no se ha reiniciado.
#
# Aquí se usa `setsid` para que la API sea líder de su propio grupo de procesos y
# se para mandando la señal al grupo entero, nunca por nombre de proceso. El
# arranque espera a que /health responda y comprueba que el proceso es nuevo.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${API_PORT:-3000}"
LOG="${API_LOG:-/tmp/intermediacion-api.log}"
PIDFILE="$ROOT/.api.pid"
ENTRY="$ROOT/apps/api/src/index.ts"

# PID del proceso que escucha el puerto. Es la única fuente fiable.
listener_pid() {
  ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1 || true
}

wait_port_free() {
  for _ in $(seq 1 50); do
    [ -z "$(listener_pid)" ] && return 0
    sleep 0.2
  done
  return 1
}

wait_healthy() {
  for _ in $(seq 1 100); do
    if curl -fsS --max-time 2 "http://localhost:$PORT/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.2
  done
  return 1
}

do_stop() {
  local pid
  pid="$(listener_pid)"
  if [ -z "$pid" ] && [ -f "$PIDFILE" ]; then
    pid="$(cat "$PIDFILE")"
  fi
  if [ -z "$pid" ]; then
    echo "API parada (nada escuchando en :$PORT)"
    rm -f "$PIDFILE"
    return 0
  fi

  # La API es líder de su grupo (setsid), así que el PGID == PID y basta con
  # negativarlo para llevar a npm exec, tsx y node en una sola señal.
  kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  if ! wait_port_free; then
    kill -KILL "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
    wait_port_free || { echo "ERROR: el puerto :$PORT sigue ocupado" >&2; return 1; }
  fi
  rm -f "$PIDFILE"
  echo "API parada (puerto :$PORT libre)"
}

do_start() {
  local before after
  before="$(listener_pid)"

  if [ -n "$before" ]; then
    echo "ERROR: ya hay algo escuchando en :$PORT (PID $before)." >&2
    echo "       Usa '$0 restart' para relanzar con el código actual." >&2
    return 1
  fi

  : >"$LOG"
  ( cd "$ROOT" && setsid nohup node --import tsx "$ENTRY" >>"$LOG" 2>&1 </dev/null & )
  sleep 0.3

  if ! wait_healthy; then
    echo "ERROR: la API no respondió /health en 20s. Log:" >&2
    tail -20 "$LOG" >&2
    return 1
  fi

  after="$(listener_pid)"
  echo "$after" >"$PIDFILE"
  echo "API arrancada en :$PORT (PID $after) · log $LOG"
}

case "${1:-status}" in
  start) do_start ;;
  stop) do_stop ;;
  restart) do_stop; do_start ;;
  status)
    pid="$(listener_pid)"
    if [ -n "$pid" ]; then
      echo "API en marcha en :$PORT (PID $pid)"
      curl -fsS --max-time 2 "http://localhost:$PORT/health" && echo
    else
      echo "API parada (nada escuchando en :$PORT)"
    fi
    ;;
  *)
    echo "Uso: $0 {start|stop|restart|status}" >&2
    exit 2
    ;;
esac
