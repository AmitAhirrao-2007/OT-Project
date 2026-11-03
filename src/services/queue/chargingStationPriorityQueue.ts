/**
 * Generic Min-Heap & Charging Station Priority Queue Implementation
 * Phase 6G: Rigorous priority queue data structure for multi-criteria EV station ranking.
 */

import {
  StationRecommendationCandidate,
  RecommendationPriority,
  StationPriorityQueueOptions
} from '../../types/queue';

/**
 * Standard array-backed Binary Min-Heap
 */
export class MinHeap<T> {
  private heap: T[] = [];
  private readonly comparator: (a: T, b: T) => number;

  constructor(comparator: (a: T, b: T) => number) {
    this.comparator = comparator;
  }

  public size(): number {
    return this.heap.length;
  }

  public isEmpty(): boolean {
    return this.heap.length === 0;
  }

  public peek(): T | undefined {
    return this.heap[0];
  }

  public push(item: T): void {
    this.heap.push(item);
    this.siftUp(this.heap.length - 1);
  }

  public pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.siftDown(0);
    }
    return top;
  }

  public toArray(): T[] {
    return [...this.heap];
  }

  public extractAllSorted(): T[] {
    const sorted: T[] = [];
    const clone = new MinHeap<T>(this.comparator);
    for (const item of this.heap) {
      clone.push(item);
    }
    while (!clone.isEmpty()) {
      sorted.push(clone.pop()!);
    }
    return sorted;
  }

  private siftUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      if (this.comparator(this.heap[current], this.heap[parent]) < 0) {
        this.swap(current, parent);
        current = parent;
      } else {
        break;
      }
    }
  }

  private siftDown(index: number): void {
    let current = index;
    const length = this.heap.length;

    while (true) {
      let smallest = current;
      const left = 2 * current + 1;
      const right = 2 * current + 2;

      if (left < length && this.comparator(this.heap[left], this.heap[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && this.comparator(this.heap[right], this.heap[smallest]) < 0) {
        smallest = right;
      }
      if (smallest !== current) {
        this.swap(current, smallest);
        current = smallest;
      } else {
        break;
      }
    }
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }
}

/**
 * Creates candidate comparator according to driver's selected recommendation priority
 */
export function createCandidateComparator(
  priority: RecommendationPriority
): (a: StationRecommendationCandidate, b: StationRecommendationCandidate) => number {
  const confidenceScore = (conf?: string) => {
    switch (conf) {
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  };

  return (a: StationRecommendationCandidate, b: StationRecommendationCandidate) => {
    // Primary criterion
    let diff = 0;
    switch (priority) {
      case 'shortest_queue':
        diff = a.estimatedWaitMinutes - b.estimatedWaitMinutes;
        break;
      case 'fastest_charging':
        diff = a.estimatedChargeMinutes - b.estimatedChargeMinutes;
        break;
      case 'lowest_cost':
        diff = a.estimatedPriceInr - b.estimatedPriceInr;
        break;
      case 'most_reliable':
        diff = (b.reliabilityScore ?? 50) - (a.reliabilityScore ?? 50);
        break;
      case 'best_overall_trip_time':
      default:
        diff = a.totalStopImpactMinutes - b.totalStopImpactMinutes;
        break;
    }

    if (Math.abs(diff) > 0.01) return diff;

    // Secondary tie-breaker 1: Total Stop Impact Minutes
    const impactDiff = a.totalStopImpactMinutes - b.totalStopImpactMinutes;
    if (Math.abs(impactDiff) > 0.01) return impactDiff;

    // Secondary tie-breaker 2: Confidence level
    const confDiff = confidenceScore(b.prediction?.confidence) - confidenceScore(a.prediction?.confidence);
    if (confDiff !== 0) return confDiff;

    // Secondary tie-breaker 3: Detour distance
    const detourDiff = a.detourDistanceMi - b.detourDistanceMi;
    if (Math.abs(detourDiff) > 0.01) return detourDiff;

    // Secondary tie-breaker 4: Charging power (higher kW preferred)
    return b.powerKw - a.powerKw;
  };
}

/**
 * Generates transparent rationale for why candidate was selected as #1 Best Choice
 */
export function generateBestChoiceRationale(
  best: StationRecommendationCandidate,
  runnerUp: StationRecommendationCandidate | undefined,
  priority: RecommendationPriority
): string {
  const waitStr = best.estimatedWaitMinutes === 0
    ? 'zero queue wait'
    : `low ${best.estimatedWaitMinutes} min wait`;

  if (!runnerUp) {
    return `Recommended as the premier verified ${best.powerKw} kW station along this highway corridor with ${waitStr}.`;
  }

  const timeSaved = Math.round(runnerUp.totalStopImpactMinutes - best.totalStopImpactMinutes);

  switch (priority) {
    case 'shortest_queue':
      if (best.estimatedWaitMinutes < runnerUp.estimatedWaitMinutes) {
        return `Recommended for shortest waiting time (${best.estimatedWaitMinutes} min vs ${runnerUp.estimatedWaitMinutes} min at ${runnerUp.station.name.slice(0, 20)}).`;
      }
      return `Recommended for immediate charger availability with ${best.powerKw} kW charging speed.`;

    case 'fastest_charging':
      return `Recommended for ultra-fast ${best.powerKw} kW capability, completing charging in ~${best.estimatedChargeMinutes} min.`;

    case 'lowest_cost':
      return `Recommended for lowest charging cost (₹${best.estimatedPriceInr} vs ₹${runnerUp.estimatedPriceInr} for this session).`;

    case 'most_reliable':
      return `Recommended for superior community reliability score (${best.reliabilityScore ?? 'Verified'}%) and verified carriageway access.`;

    case 'best_overall_trip_time':
    default:
      if (timeSaved >= 5) {
        return `Recommended because its estimated total stop time is ${timeSaved} min lower than alternatives, despite a ${best.detourDistanceMi} mi detour.`;
      }
      return `Best overall choice balancing ${best.detourDistanceMi} mi detour, ${waitStr}, and ${best.powerKw} kW charging speed.`;
  }
}

/**
 * Priority Queue manager for candidate charging stations
 */
export class ChargingStationPriorityQueue {
  private minHeap: MinHeap<StationRecommendationCandidate>;
  private readonly priority: RecommendationPriority;
  private readonly maxCandidates: number;

  constructor(options: StationPriorityQueueOptions) {
    this.priority = options.priority || 'best_overall_trip_time';
    this.maxCandidates = options.maxCandidates || 6;
    const comparator = createCandidateComparator(this.priority);
    this.minHeap = new MinHeap<StationRecommendationCandidate>(comparator);
  }

  /**
   * Enqueues a candidate station after verifying hard feasibility checks
   */
  public addCandidate(candidate: StationRecommendationCandidate): boolean {
    // Hard Feasibility Guard 1: Must be feasible according to battery/access
    if (!candidate.isFeasible) {
      return false;
    }

    // Hard Feasibility Guard 2: Must have valid road access
    if (candidate.station.accessMetadata?.roadAccessStatus === 'inaccessible') {
      return false;
    }

    // Hard Feasibility Guard 3: Must not have zero or negative charging power
    if (candidate.powerKw <= 0) {
      return false;
    }

    this.minHeap.push(candidate);
    return true;
  }

  /**
   * Extracts top candidates ranked according to the priority objective
   */
  public getRankedRecommendations(): StationRecommendationCandidate[] {
    const sorted = this.minHeap.extractAllSorted();
    const sliced = sorted.slice(0, this.maxCandidates);

    // Annotate rank and best-choice rationale
    return sliced.map((candidate, idx) => {
      const isBest = idx === 0;
      const runnerUp = sliced[1];
      return {
        ...candidate,
        recommendationRank: idx + 1,
        isBestChoice: isBest,
        bestChoiceRationale: isBest
          ? generateBestChoiceRationale(candidate, runnerUp, this.priority)
          : undefined
      };
    });
  }

  public size(): number {
    return this.minHeap.size();
  }
}

