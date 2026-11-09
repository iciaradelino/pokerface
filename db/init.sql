-- sqlcmd reads these substitution variables from the container environment.
-- This runs once per Compose start, and preserves existing databases and data.
IF DB_ID(N'players') IS NULL CREATE DATABASE players;
GO
IF DB_ID(N'game') IS NULL CREATE DATABASE game;
GO
IF SUSER_ID(N'players_app') IS NULL
  CREATE LOGIN players_app WITH PASSWORD = N'$(PLAYERS_DB_PASSWORD)';
IF SUSER_ID(N'game_app') IS NULL
  CREATE LOGIN game_app WITH PASSWORD = N'$(GAME_DB_PASSWORD)';
GO
USE players;
IF USER_ID(N'players_app') IS NULL CREATE USER players_app FOR LOGIN players_app;
IF IS_ROLEMEMBER(N'db_owner', N'players_app') <> 1
  ALTER ROLE db_owner ADD MEMBER players_app;
GO
USE game;
IF USER_ID(N'game_app') IS NULL CREATE USER game_app FOR LOGIN game_app;
IF IS_ROLEMEMBER(N'db_owner', N'game_app') <> 1
  ALTER ROLE db_owner ADD MEMBER game_app;
GO
