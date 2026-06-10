import axios from 'axios';

// Shared axios instance for all API hooks. Endpoint-specific calls live in the
// `api/*.ts` hook modules; this module only owns the base configuration.
export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});
