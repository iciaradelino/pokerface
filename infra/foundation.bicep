targetScope = 'resourceGroup'

param sqlAdminLogin string
@secure()
param sqlAdminPassword string

var prefix = 'sdd-3a-g5'
var location = 'westeurope'

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${prefix}-env'
  location: location
  properties: {
    workloadProfiles: [{ name: 'Consumption', workloadProfileType: 'Consumption' }]
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource sql 'Microsoft.Sql/servers@2023-08-01' = {
  name: '${prefix}-sql'
  location: location
  properties: {
    administratorLogin: sqlAdminLogin
    administratorLoginPassword: sqlAdminPassword
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

resource allowAzure 'Microsoft.Sql/servers/firewallRules@2023-08-01' = {
  parent: sql
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource databases 'Microsoft.Sql/servers/databases@2023-08-01' = [for service in ['players', 'game']: {
  parent: sql
  name: '${prefix}-${service}-db'
  location: location
  sku: { name: 'GP_S_Gen5', tier: 'GeneralPurpose', capacity: 1 }
  properties: {
    minCapacity: json('0.5')
    autoPauseDelay: 60
    maxSizeBytes: 2147483648
    requestedBackupStorageRedundancy: 'Local'
  }
}]

resource ui 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${prefix}-ui'
  location: location
  sku: { name: 'Free', tier: 'Free' }
  properties: {}
}

output sqlHost string = sql.properties.fullyQualifiedDomainName
output uiUrl string = 'https://${ui.properties.defaultHostname}'
