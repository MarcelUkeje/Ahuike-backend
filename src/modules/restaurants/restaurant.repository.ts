import type { Restaurant, RestaurantSummary } from './restaurant.model.js';

export interface RestaurantRepository {
  list(query?: string): Promise<RestaurantSummary[]>;
  findById(id: string): Promise<Restaurant | null>;
}

const restaurants: Restaurant[] = [
  {
    id: 'jollof-corner',
    name: 'Jollof Corner',
    slug: 'jollof-corner',
    description: 'Smoky party jollof, grilled proteins, and homestyle sides.',
    cuisine: ['Nigerian', 'Rice', 'Grill'],
    imageUrl: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=1200',
    rating: 4.8,
    ratingCount: 324,
    deliveryFee: 900,
    minimumOrder: 2500,
    estimatedDeliveryMinutes: { min: 20, max: 30 },
    isOpen: true,
    menu: [
      {
        id: 'popular',
        name: 'Popular',
        items: [
          {
            id: 'party-jollof-chicken',
            name: 'Party Jollof & Chicken',
            description: 'Smoky jollof rice with grilled chicken and fried plantain.',
            price: 4800,
            imageUrl: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=800',
            isAvailable: true,
            preparationMinutes: 18,
          },
          {
            id: 'jollof-beef',
            name: 'Jollof & Peppered Beef',
            description: 'Party jollof served with tender peppered beef.',
            price: 5200,
            imageUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=800',
            isAvailable: true,
            preparationMinutes: 20,
          },
        ],
      },
    ],
  },
  {
    id: 'mamas-kitchen',
    name: "Mama's Kitchen",
    slug: 'mamas-kitchen',
    description: 'Comforting local soups, swallows, and Nigerian favourites.',
    cuisine: ['Nigerian', 'Soups', 'Swallow'],
    imageUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=1200',
    rating: 4.7,
    ratingCount: 211,
    deliveryFee: 700,
    minimumOrder: 3000,
    estimatedDeliveryMinutes: { min: 30, max: 40 },
    isOpen: true,
    menu: [
      {
        id: 'soups',
        name: 'Soups & Swallows',
        items: [
          {
            id: 'egusi-pounded-yam',
            name: 'Egusi & Pounded Yam',
            description: 'Rich egusi soup with assorted meat and smooth pounded yam.',
            price: 5800,
            imageUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=800',
            isAvailable: true,
            preparationMinutes: 22,
          },
        ],
      },
    ],
  },
];

export class InMemoryRestaurantRepository implements RestaurantRepository {
  async list(query?: string): Promise<RestaurantSummary[]> {
    const normalized = query?.trim().toLowerCase();
    const matches = normalized
      ? restaurants.filter((restaurant) =>
          [restaurant.name, restaurant.description, ...restaurant.cuisine]
            .join(' ')
            .toLowerCase()
            .includes(normalized),
        )
      : restaurants;
    return matches.map(({ menu: _menu, ...summary }) => summary);
  }

  async findById(id: string): Promise<Restaurant | null> {
    return restaurants.find((restaurant) => restaurant.id === id) ?? null;
  }
}
