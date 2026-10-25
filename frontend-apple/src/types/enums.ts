/**
 * 枚举单一来源（Single Source of Truth）
 * ---------------------------------------------------------------
 * 状态 / 严重等级 / 判定来源 全部只允许在此定义。
 * 后端 Pydantic 枚举变更时，先在团队协作频道说明，再改这里，全站生效。
 * 组件内禁止出现裸字符串，使用 lint 规则 no-restricted-syntax 卡死。
 */

/** 任务 / 缺陷统一状态机（与 A/B/C 三份分工文档「统一状态」表一致） */
export const RunStatus = {
  /** 任务尚未执行，只允许出现在队列或初始化记录 */
  PENDING: 'pending',
  /** 执行中，前端显示进度，不能提前统计为通过 */
  RUNNING: 'running',
  /** 自动判定完成，必须带理由、证据和判定来源 */
  PASSED: 'passed',
  FAILED: 'failed',
  /** 低置信度或规则冲突，转人工复核，保留原始结论 */
  NEEDS_REVIEW: 'needs_review',
} as const
export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus]

/** 缺陷状态：修复后用同一测试集复测，不删除历史证据 */
export const FindingStatus = {
  OPEN: 'open',
  MITIGATED: 'mitigated',
} as const
export type FindingStatus = (typeof FindingStatus)[keyof typeof FindingStatus]

export const Severity = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info',
} as const
export type Severity = (typeof Severity)[keyof typeof Severity]

/**
 * 判定来源 —— 队员 A 的硬性要求：
 * 前置规则判定必须写死，大模型只作为补充。
 * 页面必须显式展示该字段，报告需统计 rule 判定占比。
 */
export const JudgeSource = {
  /** 确定性规则：工具、参数、权限、敏感字段、状态码 */
  RULE: 'rule',
  /** 指标判定：相关性、忠实度、相似度、延迟 */
  METRIC: 'metric',
  /** 语义判定：回答有效性、目标漂移、复杂安全语义（模型补充） */
  SEMANTIC: 'semantic',
  /** 人工复核终审 */
  HUMAN: 'human',
} as const
export type JudgeSource = (typeof JudgeSource)[keyof typeof JudgeSource]

/** 轨迹事件类型（与 TraceEvent 契约一致） */
export const TraceEventType = {
  INPUT: 'input',
  RETRIEVAL: 'retrieval',
  TOOL: 'tool',
  POLICY: 'policy',
  RESPONSE: 'response',
  ERROR: 'error',
} as const
export type TraceEventType = (typeof TraceEventType)[keyof typeof TraceEventType]

/** 策略决策（B 的权限矩阵，区分 allow / deny / review） */
export const PolicyDecision = {
  ALLOW: 'allow',
  DENY: 'deny',
  REVIEW: 'review',
} as const
export type PolicyDecision = (typeof PolicyDecision)[keyof typeof PolicyDecision]

/** 六类 P0 用例（直接对应 B 文档风险类型表 + 正常对照组） */
export const RiskTag = {
  DIRECT_INJECTION: 'direct_injection',
  INDIRECT_INJECTION: 'indirect_injection',
  MEMORY_POISONING: 'memory_poisoning',
  TOOL_ABUSE: 'tool_abuse',
  GOAL_DRIFT: 'goal_drift',
  BASELINE_NORMAL: 'baseline_normal',
} as const
export type RiskTag = (typeof RiskTag)[keyof typeof RiskTag]

export const RISK_TAG_LABELS: Record<RiskTag, string> = {
  [RiskTag.DIRECT_INJECTION]: '直接提示词注入',
  [RiskTag.INDIRECT_INJECTION]: '间接提示词注入',
  [RiskTag.MEMORY_POISONING]: '记忆污染',
  [RiskTag.TOOL_ABUSE]: '工具越权',
  [RiskTag.GOAL_DRIFT]: '目标漂移',
  [RiskTag.BASELINE_NORMAL]: '正常对照',
}

export const STATUS_LABELS: Record<RunStatus, string> = {
  [RunStatus.PENDING]: '待执行',
  [RunStatus.RUNNING]: '执行中',
  [RunStatus.PASSED]: '通过',
  [RunStatus.FAILED]: '失败',
  [RunStatus.NEEDS_REVIEW]: '待人工复核',
}

export const SEVERITY_LABELS: Record<Severity, string> = {
  [Severity.CRITICAL]: '严重',
  [Severity.HIGH]: '高危',
  [Severity.MEDIUM]: '中危',
  [Severity.LOW]: '低危',
  [Severity.INFO]: '提示',
}

export const JUDGE_SOURCE_LABELS: Record<JudgeSource, string> = {
  [JudgeSource.RULE]: '规则判定',
  [JudgeSource.METRIC]: '指标判定',
  [JudgeSource.SEMANTIC]: '语义判定（模型补充）',
  [JudgeSource.HUMAN]: '人工复核',
}

export const TRACE_TYPE_LABELS: Record<TraceEventType, string> = {
  [TraceEventType.INPUT]: '输入',
  [TraceEventType.RETRIEVAL]: '检索',
  [TraceEventType.TOOL]: '工具',
  [TraceEventType.POLICY]: '策略',
  [TraceEventType.RESPONSE]: '响应',
  [TraceEventType.ERROR]: '错误',
}

export const POLICY_DECISION_LABELS: Record<PolicyDecision, string> = {
  [PolicyDecision.ALLOW]: '允许',
  [PolicyDecision.DENY]: '拒绝',
  [PolicyDecision.REVIEW]: '人工确认',
}

export const FINDING_STATUS_LABELS: Record<FindingStatus, string> = {
  [FindingStatus.OPEN]: '待修复',
  [FindingStatus.MITIGATED]: '已缓解',
}

/** 严重等级排序，图表与统计按此降序 */
export const SEVERITY_ORDER: Severity[] = [
  Severity.CRITICAL,
  Severity.HIGH,
  Severity.MEDIUM,
  Severity.LOW,
  Severity.INFO,
]
