targetScope = 'resourceGroup'

param imagePrefix string
param version string
param uiUrl string
@secure()
param databaseUrls object

var prefix = 'sdd-3a-g5'

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: '${prefix}-env'
}

resource apps 'Microsoft.App/containerApps@2024-03-01' = [for service in ['players', 'game']: {
  name: '${prefix}-${service}'
  location: 'westeurope'
  properties: {
    managedEnvironmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
      secrets: [{
        name: 'database-url'
        #disable-next-line use-secure-value-for-secure-inputs
        value: databaseUrls[service]
      }]
    }
    template: {
      containers: [{
        name: service
        image: '${imagePrefix}-${service}:${version}'
        resources: { cpu: json('0.25'), memory: '0.5Gi' }
        env: concat([
          { name: 'DATABASE_URL', secretRef: 'database-url' }
          { name: 'APP_VERSION', value: version }
          { name: 'UI_ORIGIN', value: uiUrl }
        ], service == 'game' ? [
          { name: 'PLAYERS_URL', value: 'https://${prefix}-players.${environment.properties.defaultDomain}' }
        ] : [])
        probes: [{
          type: 'Startup'
          tcpSocket: { port: 3000 }
          periodSeconds: 5
          failureThreshold: 30
        }]
      }]
      scale: { minReplicas: 0, maxReplicas: 1 }
    }
  }
}]

output playersUrl string = 'https://${apps[0].properties.configuration.ingress.fqdn}'
output gameUrl string = 'https://${apps[1].properties.configuration.ingress.fqdn}'
