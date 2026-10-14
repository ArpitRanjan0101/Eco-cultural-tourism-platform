#!/bin/sh
# Development only: runs once when the postgres_data volume is first initialised.
# Creates an isolated database for the automated test suite.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
CREATE DATABASE "${POSTGRES_DB}_test";
EOSQL
