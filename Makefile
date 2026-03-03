# Makefile
.PHONY: help build up down logs run test clean

help:
	@echo "Available commands:"
	@echo "  make build    - Build Docker image"
	@echo "  make up       - Start containers in background"
	@echo "  make down     - Stop containers"
	@echo "  make logs     - View container logs"
	@echo "  make run      - Run once (quick test)"
	@echo "  make test     - Test Telegram bot"
	@echo "  make clean    - Remove containers and volumes"

build:
	docker-compose build

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f

run:
	docker-compose run --rm flashscore-odibets-comparator node index.js

test:
	docker-compose run --rm flashscore-odibets-comparator node test-telegram.js

clean:
	docker-compose down -v
	docker system prune -f