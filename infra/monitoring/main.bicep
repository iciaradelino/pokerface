param location string
param workspaceName string

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: workspaceName
}

var requests = loadTextContent('requests.kql')
var overview = '${requests}\n${loadTextContent('overview.kql')}'
var slo = '${requests}\n${loadTextContent('actions-slo.kql')}'
var panels = [for panel in [
  { title: 'Requests, 5xx rate and response time (24 hours)', query: overview, hours: 24 }
  { title: 'Game action SLO: 99% successful in under 300 ms (7 days)', query: slo, hours: 168 }
]: {
  type: 3
  name: panel.title
  content: {
    version: 'KqlItem/1.0'
    title: panel.title
    query: panel.query
    queryType: 0
    resourceType: 'microsoft.operationalinsights/workspaces'
    crossComponentResources: [logs.id]
    timeContext: { durationMs: panel.hours * 60 * 60 * 1000 }
    visualization: 'table'
    noDataMessage: 'No requests logged yet in this time window.'
  }
}]

resource savedSlo 'Microsoft.OperationalInsights/workspaces/savedSearches@2020-08-01' = {
  parent: logs
  name: 'pokerface-actions-slo'
  properties: {
    category: 'Pokerface'
    displayName: 'Pokerface action response SLO (7 days)'
    query: slo
    version: 1
  }
}

resource dashboard 'Microsoft.Insights/workbooks@2022-04-01' = {
  name: guid(logs.id, 'pokerface-monitoring')
  location: location
  kind: 'shared'
  properties: {
    displayName: 'Pokerface monitoring'
    category: 'workbook'
    sourceId: logs.id
    serializedData: string({
      version: 'Notebook/1.0'
      items: panels
      isLocked: false
      fallbackResourceIds: [logs.id]
    })
  }
}
