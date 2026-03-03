#!/bin/bash
# docker.sh - Helper script for Docker commands

case "$1" in
  build)
    docker compose build
    ;;
  run)
    docker compose run --rm football-comparator node index.js
    ;;
  start)
    docker compose up -d
    ;;
  stop)
    docker compose down
    ;;
  logs)
    docker compose logs -f
    ;;
  test)
    docker compose run --rm football-comparator node test-telegram.js
    ;;
  shell)
    docker compose run --rm football-comparator /bin/bash
    ;;
  *)
    echo "Usage: $0 {build|run|start|stop|logs|test|shell}"
    exit 1
esac