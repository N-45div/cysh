type MetricListener = (name: string, data: Record<string, any>) => void;

const listeners: MetricListener[] = [];

export function onMetric(listener: MetricListener) {
  listeners.push(listener);
}

export function emitMetric(name: string, data: Record<string, any>) {
  for (const l of listeners) {
    try {
      l(name, data);
    } catch (_) {
      // swallow
    }
  }
}

export function nowMs() {
  return Date.now();
}

// ========== ER-Specific Metrics ==========

export interface ERMetrics {
  batchCommits: {
    total: number;
    success: number;
    failed: number;
  };
  latency: {
    delegate: number[];
    commit: number[];
    undelegate: number[];
    erExecution: number[];
  };
  errors: {
    total: number;
    byType: Record<string, number>;
  };
}

class ERMetricsCollector {
  private metrics: ERMetrics = {
    batchCommits: { total: 0, success: 0, failed: 0 },
    latency: {
      delegate: [],
      commit: [],
      undelegate: [],
      erExecution: [],
    },
    errors: { total: 0, byType: {} },
  };

  recordBatchCommit(success: boolean) {
    this.metrics.batchCommits.total++;
    if (success) {
      this.metrics.batchCommits.success++;
    } else {
      this.metrics.batchCommits.failed++;
    }
    emitMetric('er.batch_commit', {
      success,
      total: this.metrics.batchCommits.total,
      successRate: this.metrics.batchCommits.success / this.metrics.batchCommits.total,
    });
  }

  recordLatency(operation: keyof ERMetrics['latency'], durationMs: number) {
    this.metrics.latency[operation].push(durationMs);
    
    // Keep only last 100 samples
    if (this.metrics.latency[operation].length > 100) {
      this.metrics.latency[operation].shift();
    }

    emitMetric(`er.latency.${operation}`, {
      duration: durationMs,
      avg: this.getAvgLatency(operation),
      p50: this.getPercentile(operation, 50),
      p95: this.getPercentile(operation, 95),
      p99: this.getPercentile(operation, 99),
    });
  }

  recordError(errorType: string, errorMessage: string) {
    this.metrics.errors.total++;
    this.metrics.errors.byType[errorType] = (this.metrics.errors.byType[errorType] || 0) + 1;
    
    emitMetric('er.error', {
      type: errorType,
      message: errorMessage,
      total: this.metrics.errors.total,
      byType: this.metrics.errors.byType,
    });
  }

  getMetrics(): ERMetrics {
    return JSON.parse(JSON.stringify(this.metrics));
  }

  getAvgLatency(operation: keyof ERMetrics['latency']): number {
    const samples = this.metrics.latency[operation];
    if (samples.length === 0) return 0;
    return samples.reduce((a, b) => a + b, 0) / samples.length;
  }

  getPercentile(operation: keyof ERMetrics['latency'], percentile: number): number {
    const samples = [...this.metrics.latency[operation]].sort((a, b) => a - b);
    if (samples.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * samples.length) - 1;
    return samples[index];
  }

  reset() {
    this.metrics = {
      batchCommits: { total: 0, success: 0, failed: 0 },
      latency: {
        delegate: [],
        commit: [],
        undelegate: [],
        erExecution: [],
      },
      errors: { total: 0, byType: {} },
    };
  }
}

export const erMetrics = new ERMetricsCollector();

/**
 * Measure operation duration and record latency
 */
export async function measureLatency<T>(
  operation: keyof ERMetrics['latency'],
  fn: () => Promise<T>
): Promise<T> {
  const start = nowMs();
  try {
    const result = await fn();
    erMetrics.recordLatency(operation, nowMs() - start);
    return result;
  } catch (error) {
    erMetrics.recordLatency(operation, nowMs() - start);
    throw error;
  }
}
