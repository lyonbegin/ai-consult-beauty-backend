# AI Consult Beauty Backend

Backend and data-ingestion service for the AI K-Beauty consultation platform.

## Stack
- Python 3.11+
- FastAPI
- Uvicorn
- SQLAlchemy
- PostgreSQL in Railway
- SQLite for local development

## Services
This repository is intended to back two Railway services:
1. **beauty-api** — FastAPI HTTP API
2. **beauty-worker** — collectors/import jobs using the same codebase

## Initial data domains
- K-Beauty products
- Hospitals / clinics
- Doctors
- Procedures and prices
- Hotels / stay
- Orders / delivery / tax-free support

The first milestone is infrastructure and data migration. Real-time AI consultation and WebRTC are added after the data/API layer is stable.
