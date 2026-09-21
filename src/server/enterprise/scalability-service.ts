export type JobPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";

export type BackgroundJob<T = any> = {
  jobId: string;
  queueName: string;
  payload: T;
  priority: JobPriority;
  maxRetries: number;
  retryCount: number;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "DEAD_LETTER";
  scheduledAt: string;
  completedAt?: string;
  lastError?: string;
};

export class EnterpriseScalabilityService {
  /**
   * Evaluates job retry logic with exponential backoff.
   * If retryCount >= maxRetries, moves job to DEAD_LETTER queue.
   */
  static evaluateJobRetry(
    job: BackgroundJob,
    error: string,
  ): {
    nextStatus: "QUEUED" | "DEAD_LETTER";
    retryCount: number;
    delaySeconds: number;
  } {
    const nextRetry = job.retryCount + 1;
    if (nextRetry > job.maxRetries) {
      return {
        nextStatus: "DEAD_LETTER",
        retryCount: nextRetry,
        delaySeconds: 0,
      };
    }

    // Exponential backoff: 2^(retry - 1) * 30 seconds
    const delaySeconds = Math.pow(2, nextRetry - 1) * 30;
    return {
      nextStatus: "QUEUED",
      retryCount: nextRetry,
      delaySeconds,
    };
  }

  /**
   * In-Memory multi-tier tag-based cache engine.
   */
  static createTagCache() {
    const store = new Map<string, { value: any; tags: string[]; expiresAt: number }>();

    return {
      set(key: string, value: any, ttlSeconds: number, tags: string[] = []) {
        store.set(key, {
          value,
          tags,
          expiresAt: Date.now() + ttlSeconds * 1000,
        });
      },
      get(key: string) {
        const item = store.get(key);
        if (!item) return null;
        if (Date.now() > item.expiresAt) {
          store.delete(key);
          return null;
        }
        return item.value;
      },
      invalidateTags(tag: string) {
        let count = 0;
        for (const [key, item] of store.entries()) {
          if (item.tags.includes(tag)) {
            store.delete(key);
            count++;
          }
        }
        return count;
      },
      size() {
        return store.size;
      },
    };
  }

  /**
   * Chunks large transaction arrays into manageable, memory-safe database batches.
   */
  static chunkBatch<T>(items: T[], chunkSize = 100): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
