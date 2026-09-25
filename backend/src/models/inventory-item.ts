export interface InventoryItem {
  itemId: number;
  amount: number;
}

export interface ItemInfo {
  id: number;
  name: string;
  gems: number;
  category?: string;
  value?: number;
}
