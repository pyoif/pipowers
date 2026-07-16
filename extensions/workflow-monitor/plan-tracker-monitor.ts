import type { Task } from "../../plan-tracker.js";

export interface PlanTrackerState {
  initialized: boolean;
  tasks: Task[];
}

export const PLAN_TRACKER_DEFAULT_STATE: PlanTrackerState = {
  initialized: false,
  tasks: [],
};

export class PlanTrackerMonitor {
  private state: PlanTrackerState = { ...PLAN_TRACKER_DEFAULT_STATE };

  getState(): PlanTrackerState {
    return JSON.parse(JSON.stringify(this.state));
  }

  setState(state: PlanTrackerState): void {
    this.state = { ...PLAN_TRACKER_DEFAULT_STATE, ...state };
  }

  isInitialized(): boolean {
    return this.state.initialized;
  }

  setInitialized(value: boolean): void {
    this.state.initialized = value;
  }
}
