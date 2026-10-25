/** Versioned desktop contract shared by the API client and MSW handlers. */
export const API_PREFIX = '/api/v2'

export const apiPath = (path: string) => `${API_PREFIX}${path}`
