export interface OrderRecord {
  orderDate?: Date | string;
  dropiId?: string | number;
  customerName: string;
  phone: string;
  whatsappLink?: string;
  product: string;
  price: number | string;
  city: string;
  department?: string;
  address: string;
  neighborhood?: string;
  deliveryType: string;
  paymentMethod?: string;
  status?: string;
}


export interface ISheetsService {
  isConfigured(): boolean;
  appendOrder(order: OrderRecord): Promise<boolean>;
}
