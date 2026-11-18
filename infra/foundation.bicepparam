using './foundation.bicep'

param sqlAdminLogin = 'pokerface_admin'
param sqlAdminPassword = readEnvironmentVariable('SQL_ADMIN_PASSWORD')
