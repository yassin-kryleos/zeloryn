import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 10 }, // Ramp up to 10 users
    { duration: '20s', target: 10 }, // Stay at 10 users
    { duration: '10s', target: 0 },  // Ramp down to 0 users
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],   // error rate must be less than 1%
    http_req_duration: ['p(95)<200'], // 95% of requests must complete below 200ms
  },
};

const BASE_URL = 'http://localhost:3001';

export default function () {
  // 1. Fetch telemetry
  const resTelemetry = http.get(`${BASE_URL}/api/telemetry`);
  check(resTelemetry, {
    'telemetry status is 200': (r) => r.status === 200,
  });

  sleep(0.5);

  // 2. Fetch sessions list
  const resSessions = http.get(`${BASE_URL}/api/sessions`);
  check(resSessions, {
    'sessions status is 200': (r) => r.status === 200,
  });

  sleep(0.5);
}
