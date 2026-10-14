import { readFileSync } from 'fs';
import { join } from 'path';

const CHART = join(
  __dirname,
  '../../infrastructure/Helm/templates/deployment.yaml',
);

/**
 * Every "key: value" line under one Kubernetes check of the chart, with the
 * nesting dropped ("path", "periodSeconds"). The chart is a Helm template, not
 * plain YAML, so it is read as text.
 */
function probeSettings(chart: string[], probe: string): Record<string, string> {
  const start = chart.findIndex((line) => line.trim() === `${probe}:`);
  expect(start).toBeGreaterThanOrEqual(0);
  const indent = chart[start].indexOf(probe);
  const settings: Record<string, string> = {};
  for (const line of chart.slice(start + 1)) {
    if (line.length - line.trimStart().length <= indent) {
      break;
    }
    const [key, ...rest] = line.trim().split(':');
    const value = rest.join(':').trim();
    if (value !== '') {
      settings[key] = value;
    }
  }
  return settings;
}

// The chart's Kubernetes checks act on the health test, which runs once a
// minute: out of traffic after two failed tests, restarted after five, about 5
// minutes, and an answer that takes over 5 seconds counts as failed.
describe('the chart', () => {
  const chart = readFileSync(CHART, 'utf8').split('\n');

  it('waits up to 2 minutes for the first health test', () => {
    expect(probeSettings(chart, 'startupProbe')).toEqual({
      path: '/health/startup',
      port: 'http',
      periodSeconds: '5',
      failureThreshold: '24',
    });
  });

  it('takes the pod out of traffic after two failed tests', () => {
    expect(probeSettings(chart, 'readinessProbe')).toEqual({
      path: '/health/ready',
      port: 'http',
      periodSeconds: '60',
      timeoutSeconds: '5',
      failureThreshold: '2',
    });
  });

  it('restarts the pod after 5 minutes of failed tests', () => {
    expect(probeSettings(chart, 'livenessProbe')).toEqual({
      path: '/health/live',
      port: 'http',
      periodSeconds: '60',
      timeoutSeconds: '5',
      failureThreshold: '5',
    });
  });
});
