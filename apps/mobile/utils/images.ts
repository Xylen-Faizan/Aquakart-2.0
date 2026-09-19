// apps/mobile/utils/images.ts

export const ProductImages: Record<string, any> = {
  'aquacia_1l.png': require('../assets/images/aquacia_1l.png'),
  'aquacia_250ml.png': require('../assets/images/aquacia_250ml.png'),
  'aquacia_500ml.png': require('../assets/images/aquacia_500ml.png'),
  
  'aquafina_1l.png': require('../assets/images/aquafina_1l.png'),
  'aquafina_20l.png': require('../assets/images/aquafina_20l.png'),
  'aquafina_250ml.png': require('../assets/images/aquafina_250ml.png'),
  'aquafina_500ml.png': require('../assets/images/aquafina_500ml.png'),
  
  'bisleri_1l.png': require('../assets/images/bisleri_1l.png'),
  'bisleri_20l.png': require('../assets/images/bisleri_20l.png'),
  'bisleri_250ml.png': require('../assets/images/bisleri_250ml.png'),
  'bisleri_500ml.png': require('../assets/images/bisleri_500ml.png'),
  
  'kinley_1l.png': require('../assets/images/kinley_1l.png'),
  'kinley_250ml.png': require('../assets/images/kinley_250ml.png'),
  'kinley_500ml.png': require('../assets/images/kinley_500ml.png'),
  
  // generic fallbacks
  'jar_20l.png': require('../assets/images/jar_20l.png'),
  'bottle_1l.png': require('../assets/images/bottle_1l.png'),
};

export const getProductImage = (imageName: string | null | undefined) => {
  if (!imageName) return null;
  return ProductImages[imageName] || null;
};
