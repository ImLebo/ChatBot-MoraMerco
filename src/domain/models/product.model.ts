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
  slug: string; // ej. base-lavadora
  name: string;
  trackingKeywords: string[]; // palabras clave del mensaje predeterminado del anuncio, ej. ['base de lavadora', 'barras con ruedas', 'soporte']
  primaryAssetPath: string; // ruta a la imagen en assets/
  pricingCombos: PricingCombo[];
  systemPromptContext: string; // reglas técnicas, objeciones y características exclusivas del producto para Gemini
  followUpHooks: ProductFollowUpHooks;
}
