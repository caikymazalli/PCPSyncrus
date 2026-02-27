// Type Definitions for Domain Models

// Represents a Plant in the system
interface Plant {
    id: number;
    name: string;
    location: string;
    capacity: number;
}

// Represents a Machine in the system
interface Machine {
    id: number;
    name: string;
    type: string;
    plantId: number;
}

// Represents a Workbench in the system
interface Workbench {
    id: number;
    name: string;
    locationId: number;
}

// Represents a Product in the system
interface Product {
    id: number;
    name: string;
    description: string;
    unit: string;
}

// Represents a Production Order
interface ProductionOrder {
    id: number;
    productId: number;
    quantity: number;
    status: string;
}

// Represents a Production Entry
interface ProductionEntry {
    id: number;
    productionOrderId: number;
    quantity: number;
    timestamp: string;
}

// Represents a Work Instruction
interface WorkInstruction {
    id: number;
    productionOrderId: number;
    instruction: string;
}

// Represents a Supplier
interface Supplier {
    id: number;
    name: string;
    contactInfo: string;
}

// Represents a Bill of Material Item
interface BomItem {
    id: number;
    productId: number;
    quantity: number;
}

// Represents a Route
interface Route {
    id: number;
    name: string;
    steps: string[];
}

// Represents a Non-Conformance
interface NonConformance {
    id: number;
    description: string;
    productionOrderId: number;
    reportedAt: string;
}

// Represents KPI Data
interface KpiData {
    id: number;
    value: number;
    timestamp: string;
}

// Represents a Stock Item
interface StockItem {
    id: number;
    productId: number;
    quantity: number;
}

// Represents a Separation Order
interface SeparationOrder {
    id: number;
    productId: number;
    quantity: number;
}

// Represents a Stock Exit
interface StockExit {
    id: number;
    stockItemId: number;
    quantity: number;
    timestamp: string;
}

// Represents Tenant Data (placeholder)
interface TenantData {
    // Define the structure based on your requirements
}

export {
    Plant,
    Machine,
    Workbench,
    Product,
    ProductionOrder,
    ProductionEntry,
    WorkInstruction,
    Supplier,
    BomItem,
    Route,
    NonConformance,
    KpiData,
    StockItem,
    SeparationOrder,
    StockExit,
    TenantData
};