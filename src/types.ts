/**
 * types.ts — Shared type definitions for PCP Syncrus
 *
 * Central repository of all domain interfaces used across routes and stores.
 */

// ── Infrastructure ─────────────────────────────────────────────────────────────

export interface Plant {
  id: string
  name: string
  location: string
  totalCapacity: number
  contact: string
  status: string
  notes: string
  createdAt?: string
}

export interface Machine {
  id: string
  name: string
  type: string
  capacity: string
  plantId: string
  plantName: string
  status: string
  specs: string
  createdAt?: string
}

export interface Workbench {
  id: string
  name: string
  function: string
  plantId?: string
  plantName: string
  status: string
  createdAt?: string
}

// ── Products & BOM ─────────────────────────────────────────────────────────────

export interface Product {
  id: string
  name: string
  code: string
  unit: string
  type?: string
  stockMin: number
  stockMax?: number
  stockCurrent?: number
  stockStatus: string
  price?: number
  notes?: string
  description?: string
  serialControlled: boolean
  controlType: string | null
  supplierId?: string
  supplierIds?: string[]
  criticalPercentage?: number
  productionType?: string
  leadTimeDays?: number
  criticalAlertSent?: boolean
  createdAt?: string
}

export interface BomItem {
  id: string
  productName: string
  productCode: string
  componentName: string
  componentCode: string
  quantity: number
  unit: string
}

export interface RouteStep {
  order: number
  operation: string
  resourceType: string
  standardTime: number
}

export interface ProductionRoute {
  id: string
  productName: string
  productCode: string
  name: string
  steps: RouteStep[]
}

// ── Work Instructions ──────────────────────────────────────────────────────────

export interface WorkInstructionStep {
  order?: number
  description: string
  hasPhoto?: boolean
  photo?: string | null
}

export interface WorkInstruction {
  id: string
  title: string
  code: string
  version: number | string
  status: string
  productName?: string | null
  productId?: string
  operation?: string
  estimatedTime?: number
  steps: WorkInstructionStep[]
  tools?: string[]
  epi?: string[]
  createdBy?: string
  approvedBy?: string | null
  notes?: string
  createdAt?: string
}

// ── Production ─────────────────────────────────────────────────────────────────

export interface ProductionOrder {
  id: string
  code: string
  productName: string
  quantity: number
  startDate: string
  endDate: string
  status: string
  priority: string
  plantName: string
  completedQuantity: number
  pedido?: string
  cliente?: string
}

export interface ProductionEntry {
  id: string
  orderCode: string
  stepName: string
  quantityProduced: number
  quantityRejected: number
  timeSpent: number
  operator: string
  recordedAt: string
  ncGenerated: boolean
}

export interface WorkOrder {
  id: string
  [key: string]: unknown
}

// ── Quality ────────────────────────────────────────────────────────────────────

export interface NonConformance {
  id: string
  code: string
  orderCode: string
  stepName: string
  operator: string
  quantityRejected: number
  description: string
  status: string
  severity: string
  createdAt: string
  images: string[]
  rootCause: string
  correctiveAction: string
  responsible: string
}

export interface QualityCheck {
  id: string
  [key: string]: unknown
}

// ── Stock & Warehouse ──────────────────────────────────────────────────────────

export interface StockItem {
  id: string
  name: string
  code: string
  unit: string
  category: string
  quantity: number
  minQuantity: number
  location: string
  notes?: string
  serialControlled: boolean
  controlType: string | null
  stockStatus: string
  createdAt?: string
}

export interface SerialNumber {
  id: string
  itemCode: string
  itemName: string
  number: string
  type: string
  status: string
  quantity: number
  createdAt: string
  createdBy: string
  origin: string
  orderCode: string | null
}

export interface SerialPendingItem {
  id: string
  [key: string]: unknown
}

export interface Warehouse {
  id: string
  [key: string]: unknown
}

export interface SeparationOrder {
  id: string
  code: string
  pedido: string
  cliente: string
  dataSeparacao: string
  responsavel: string
  status: string
  items: unknown[]
  createdAt?: string
}

export interface StockExit {
  id: string
  code: string
  type: string
  pedido: string
  nf?: string
  date: string
  responsavel: string
  notes?: string
  items: unknown[]
  createdAt?: string
}

// ── Suppliers & Purchasing ──────────────────────────────────────────────────────

export interface Supplier {
  id: string
  name: string
  fantasia?: string
  tradeName?: string
  cnpj?: string | null
  email?: string
  phone?: string
  contact?: string
  city?: string
  state?: string
  country?: string
  category?: string
  type?: string
  paymentTerms?: string
  deliveryLeadDays?: number
  notes?: string
  active?: boolean
  rating?: number
  createdAt?: string
}

export interface ProductSupplier {
  id: string
  productCode: string
  supplierIds: string[]
  priorities: Record<string, number>
  internalProduction: boolean
}

export interface Quotation {
  id: string
  [key: string]: unknown
}

export interface PurchaseOrder {
  id: string
  [key: string]: unknown
}

export interface Import {
  id: string
  [key: string]: unknown
}

// ── Users & KPIs ───────────────────────────────────────────────────────────────

export interface TenantUser {
  id: string
  name: string
  email: string
  role: string
  avatar?: string | null
}

export interface KpiData {
  totalOrders: number
  activeOrders: number
  plannedOrders: number
  completedOrders: number
  cancelledOrders: number
  totalProduced: number
  totalRejected: number
  totalProducts: number
  totalMachines: number
  totalPlants: number
  completionRate: number
  qualityRate: number
}

export interface ChartData {
  labels?: string[]
  planned?: number[]
  produced?: number[]
  rejected?: number[]
  stockStatus?: {
    critical: number
    normal: number
    purchase_needed: number
    manufacture_needed: number
  }
  [key: string]: unknown
}
