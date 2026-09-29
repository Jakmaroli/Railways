export type Department = "TMS" | "SMMS" | "TDMS" | "COA" | "BDMS" | "CONTROL";
export type UserRole = "admin" | "engineer" | "viewer";
export type DefectStatus = "open" | "scheduled" | "in_progress" | "completed" | "overrun";

export interface User {
  id: number;
  username: string;
  full_name: string;
  department: Department;
  role: UserRole;
}

export interface Corridor {
  corridor_id: string;
  name: string;
  division: string;
  zone: string;
  is_high_density: boolean;
  avg_daily_trains: number;
}

export interface Defect {
  task_id: number;
  source_system: Department;
  asset_id: string;
  corridor_id: string;
  defect_type: string;
  severity: number;
  date_reported: string;
  due_date: string;
  estimated_block_duration: number;
  department: string;
  location_marker: string;
  recurrence_count: number;
  status: DefectStatus;
  priority_score?: number;
  health_score?: number;
}

export type PossessionStatus =
  | "planned"
  | "scheduled"
  | "safety_approved"
  | "issued"
  | "active"
  | "completed"
  | "overrun"
  | "rescheduled"
  | "rejected";

export interface ScheduleBlock {
  id: number;
  task_id: number | null;
  corridor_id: string;
  date: string;
  slot_start: string;
  slot_end: string;
  priority_score: number;
  merged_with: string | null;
  explanation_text: string;
  status: PossessionStatus | string;
  actual_duration: number | null;
  possession_number?: string | null;
  rejection_reason?: string | null;
}

export interface BlockRequest {
  id: number;
  defect_id: number | null;
  corridor_id: string;
  department: Department;
  requested_date: string;
  requested_start: string;
  requested_end: string;
  reason: string;
  status: "pending" | "approved" | "merged" | "rejected";
  possession_number?: string | null;
}

export interface KpiSummary {
  open_defects: number;
  overdue_defects: number;
  scheduled_blocks: number;
  avg_priority_score: number;
  high_density_corridors_at_risk: number;
  punctuality_protection_pct: number;
}

export interface ModelEngineStatus {
  loaded: boolean;
  model_type: string | null;
  model_description?: string | null;
  is_rule_generalization?: boolean;
  fallback_active: boolean;
  load_error: string | null;
  loaded_at: string | null;
  trained_at: string | null;
  validation_mae: number | null;
  n_training_samples: number | null;
  feature_columns: string[];
  feature_importances: Record<string, number> | null;
  calls_scored_by_model: number;
  calls_scored_by_fallback: number;
}

export interface MlInsights {
  engine: ModelEngineStatus;
  totals: {
    blocks_scheduled: number;
    completed: number;
    overrun: number;
    planned: number;
    merged_blocks: number;
  };
}
