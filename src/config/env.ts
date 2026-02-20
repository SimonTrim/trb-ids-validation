export const env = {
  tcApiBase: import.meta.env.VITE_TC_API_BASE as string | undefined,
  tcRegion: (import.meta.env.VITE_TC_REGION as string) ?? 'europe',
  extBaseUrl: import.meta.env.VITE_EXT_BASE_URL as string | undefined,
  debug: import.meta.env.VITE_DEBUG === 'true',
  isDev: import.meta.env.DEV,
} as const;
