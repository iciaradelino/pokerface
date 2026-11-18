using './apps.bicep'

param imagePrefix = readEnvironmentVariable('IMAGE_PREFIX')
param version = readEnvironmentVariable('APP_VERSION')
param uiUrl = readEnvironmentVariable('UI_URL')
param databaseUrls = {
  players: 'Server=${readEnvironmentVariable('SQL_HOST')},1433;Database=sdd-3a-g5-players-db;User Id=players_app;Password=${readEnvironmentVariable('PLAYERS_DB_PASSWORD')};Encrypt=yes;TrustServerCertificate=no'
  game: 'Server=${readEnvironmentVariable('SQL_HOST')},1433;Database=sdd-3a-g5-game-db;User Id=game_app;Password=${readEnvironmentVariable('GAME_DB_PASSWORD')};Encrypt=yes;TrustServerCertificate=no'
}
