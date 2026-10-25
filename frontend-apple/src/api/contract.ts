/** Versioned desktop contract shared by the API client and MSW handlers. */
export const API_PREFIX = '/api/v2'

export const apiPath = (path: string) => `${API_PREFIX}${path}`

const pageBase = import.meta.env.BASE_URL === '/'
  ? ''
  : import.meta.env.BASE_URL.replace(/\/$/, '')

export const mockApiPath = (path: string) => `${pageBase}${API_PREFIX}${path}`
