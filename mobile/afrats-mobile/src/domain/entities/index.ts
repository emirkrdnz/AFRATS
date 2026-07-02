export interface User { id:string; email:string; firstName:string; lastName:string; role:'User'|'Admin'; createdAt:string; }
export interface Category { id:string; name:string; type:'Income'|'Expense'; isSystem:boolean; }
export interface Transaction { id:string; userId:string; categoryId:string; categoryName:string; type:'Income'|'Expense'; amount:number; description:string; transactionDate:string; createdAt:string; }
export interface Anomaly { id:string; transactionId:string; algorithmName:string; score:number; isAnomaly:boolean; explanation:string; detectedAt:string; modelVersion:string; status:string; reviewedAt?:string; metrics?:{ votes:number; consensus:number }; }
export interface AlgorithmResult { score:number; isAnomaly:boolean; metrics?:Record<string, number>; }
export interface AnomalyDetail {
  transactionId:string;
  isAnomaly:boolean;
  anomalyScore:number;
  explanation:string;
  status:string;
  reviewedAt?:string|null;
  algorithmResults:{ isolationForest?:AlgorithmResult; zScore?:AlgorithmResult; lof?:AlgorithmResult; xgboost?:AlgorithmResult };
  ensemble?:{ consensus:number; votes:number; finalScore:number };
  detectedAt:string;
}
export interface RiskFactors { anomaly_weight?: number; debt_ratio?: number; spending_trend?: number; spending_trend_months?: { recent: string; previous: string }; override_reasons?: string[]; }
export interface RiskProfile { score:number; level:'Low'|'Medium'|'High'; factors?:RiskFactors; calculatedAt?:string; }
export interface RiskHistoryItem { score:number; level:'Low'|'Medium'|'High'; calculatedAt:string; }
export interface CategorySummary { categoryId:string; categoryName:string; totalAmount:number; transactionCount:number; percentage:number; }
export interface PreviousPeriod { totalIncome:number; totalExpense:number; netBalance:number; transactionCount:number; anomalyCount:number; }
export interface TransactionSummary { month:number; year:number; totalIncome:number; totalExpense:number; netBalance:number; transactionCount:number; anomalyCount:number; categoryBreakdown?: CategorySummary[]; previousPeriod?: PreviousPeriod | null; }
export interface Notification { id:string; userId:string; title:string; message:string; type:'AnomalyDetected'|'RiskLevelChanged'|'SystemAlert'; isRead:boolean; createdAt:string; }
export interface AuthTokens { accessToken:string; refreshToken:string; user:User; }
export interface PaginatedResult<T> { items:T[]; totalCount:number; page:number; pageSize:number; totalPages:number; hasNextPage:boolean; hasPreviousPage:boolean; }
export interface AnomalyListResponse { items: Anomaly[]; totalCount?: number; page?: number; pageSize?: number; }
