.PHONY: dev-backend dev-frontend test seed install lint

install:
	pip install fastapi pydantic pydantic-settings uvicorn pyyaml httpx pytest pytest-cov
	cd apps/cockpit && npm install

dev-backend:
	SQLITE_DB=signal.db \
	INVENTORY_FILE=data/inventory.json \
	LINEAGE_FILE=data/lineage.json \
	CONTRACTS_DIR=contracts \
	CHECKS_DIR=checks \
	uvicorn services.api.main:app --reload --port 8000

dev-frontend:
	cd apps/cockpit && npm run dev

test:
	python -m pytest tests/ -v --tb=short

seed:
	python scripts/seed.py

lint:
	python -m py_compile packages/dq_core/**/*.py services/api/**/*.py
	cd apps/cockpit && npx tsc --noEmit
