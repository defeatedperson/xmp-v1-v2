const phpPattern = /^php\d{2}$/i

export const fetchPhpContainers = async (nodeId) => {
  if (!nodeId) {
    throw new Error('nodeId is required')
  }

  const response = await fetch(`/api/forward/${encodeURIComponent(nodeId)}/docker/containers`)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const result = await response.json()
  if (!result || result.success !== true || !Array.isArray(result.data)) {
    return []
  }

  return result.data
    .filter((container) => phpPattern.test(container.name))
    .map((container) => {
      const ports = Array.isArray(container.ports) ? container.ports : []
      const port = ports.find((p) => typeof p.PublicPort === 'number')

      return {
        name: container.name,
        state: container.state,
        publicPort: port ? port.PublicPort : null,
      }
    })
}

export default {
  fetchPhpContainers,
}

