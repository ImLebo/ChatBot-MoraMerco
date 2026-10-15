export interface PricingCombo {
  id: string;
  label: string;
  price: number;
  savings?: number;
}

export interface ProductFollowUpHooks {
  firstFollowUp: string;
  secondFollowUp: string;
}

export interface ProductConfig {
  id: string;
  slug: string; // ej. luces-solar-10m
  dropiId?: string | number; // ID del producto en Dropi para logística interna
  name: string;
  trackingKeywords: string[]; // palabras clave del mensaje predeterminado del anuncio
  primaryAssetPath?: string; // ruta a la imagen en assets/
  pricingCombos: PricingCombo[];
  systemPromptContext: string; // reglas técnicas, objeciones y características exclusivas del producto para Gemini
  followUpHooks: ProductFollowUpHooks;
}

