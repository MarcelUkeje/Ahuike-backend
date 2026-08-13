export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  isAvailable: boolean;
  preparationMinutes: number;
}

export interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  description: string;
  cuisine: string[];
  imageUrl: string;
  rating: number;
  ratingCount: number;
  deliveryFee: number;
  minimumOrder: number;
  estimatedDeliveryMinutes: { min: number; max: number };
  isOpen: boolean;
  menu: MenuCategory[];
}

export type RestaurantSummary = Omit<Restaurant, 'menu'>;
