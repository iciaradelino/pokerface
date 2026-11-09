#!/usr/bin/env bash
set -euo pipefail
export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"
/opt/mssql-tools18/bin/sqlcmd -S db -U sa -C -b -l 5 -i /init/init.sql
echo 'Database initialization complete.'
