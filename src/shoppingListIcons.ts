import type {ComponentType} from 'react';
import {
  Apple,
  Baby,
  Backpack,
  Beef,
  BrushCleaning,
  Car,
  Carrot,
  CircleCheck,
  Coffee,
  CookingPot,
  Fish,
  Fuel,
  Gift,
  House,
  List,
  Milk,
  Package,
  PartyPopper,
  PawPrint,
  Pill,
  ReceiptText,
  RefreshCcw,
  ShelvingUnit,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  Star,
  Store,
  Tag,
  TreePine,
  Utensils,
  Wheat,
} from 'lucide-react-native';
import type {ShoppingListIconKey} from './domain/types';

export type ShoppingListIconComponent = ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
}>;

export type ShoppingListIconDefinition = {
  key: ShoppingListIconKey;
  label: string;
  tags: string[];
  Icon: ShoppingListIconComponent;
};

export const DEFAULT_SHOPPING_LIST_ICON_KEY = 'basket';
export const DEFAULT_AUTO_SHOPPING_LIST_ICON_KEY = 'refresh';

export const SHOPPING_LIST_ICONS: ShoppingListIconDefinition[] = [
  {key: 'basket', label: 'Koszyk', tags: ['zakupy', 'koszyk'], Icon: ShoppingBasket},
  {key: 'cart', label: 'Wózek', tags: ['zakupy', 'sklep', 'wozek'], Icon: ShoppingCart},
  {key: 'bag', label: 'Torba', tags: ['zakupy', 'torba'], Icon: ShoppingBag},
  {key: 'store', label: 'Sklep', tags: ['sklep', 'market'], Icon: Store},
  {key: 'list', label: 'Lista', tags: ['lista', 'notatka'], Icon: List},
  {key: 'receipt', label: 'Paragon', tags: ['paragon', 'wydatki'], Icon: ReceiptText},
  {key: 'tag', label: 'Promocje', tags: ['promocja', 'rabat'], Icon: Tag},
  {key: 'home', label: 'Domowe', tags: ['dom', 'domowe'], Icon: House},
  {key: 'shelf', label: 'Spiżarnia', tags: ['spizarnia', 'zapasy'], Icon: ShelvingUnit},
  {key: 'box', label: 'Zapasy', tags: ['zapasy', 'pudelko'], Icon: Package},
  {key: 'refresh', label: 'Uzupełnianie', tags: ['auto', 'braki'], Icon: RefreshCcw},
  {key: 'check', label: 'Gotowe', tags: ['kupione', 'gotowe'], Icon: CircleCheck},
  {key: 'pot', label: 'Obiad', tags: ['obiad', 'garnek', 'zupa'], Icon: CookingPot},
  {key: 'utensils', label: 'Jedzenie', tags: ['jedzenie', 'posilek'], Icon: Utensils},
  {key: 'carrot', label: 'Warzywa', tags: ['warzywa', 'marchew'], Icon: Carrot},
  {key: 'apple', label: 'Owoce', tags: ['owoce', 'jablko'], Icon: Apple},
  {key: 'milk', label: 'Nabiał', tags: ['mleko', 'nabial'], Icon: Milk},
  {key: 'bread', label: 'Pieczywo', tags: ['chleb', 'bulki'], Icon: Wheat},
  {key: 'fish', label: 'Ryby', tags: ['ryba', 'ryby'], Icon: Fish},
  {key: 'beef', label: 'Mięso', tags: ['mieso', 'wolowina'], Icon: Beef},
  {key: 'coffee', label: 'Kawa', tags: ['kawa', 'napoje'], Icon: Coffee},
  {key: 'party', label: 'Impreza', tags: ['impreza', 'urodziny'], Icon: PartyPopper},
  {key: 'gift', label: 'Prezenty', tags: ['prezent', 'prezenty'], Icon: Gift},
  {key: 'holiday', label: 'Święta', tags: ['swieta', 'choinka'], Icon: TreePine},
  {key: 'star', label: 'Specjalne', tags: ['specjalne', 'wazne'], Icon: Star},
  {key: 'backpack', label: 'Weekend', tags: ['weekend', 'wyjazd'], Icon: Backpack},
  {key: 'baby', label: 'Dziecko', tags: ['dziecko', 'niemowle'], Icon: Baby},
  {key: 'pet', label: 'Zwierzęta', tags: ['zwierze', 'karma'], Icon: PawPrint},
  {key: 'pharmacy', label: 'Apteka', tags: ['apteka', 'leki'], Icon: Pill},
  {key: 'cleaning', label: 'Sprzątanie', tags: ['chemia', 'sprzatanie'], Icon: BrushCleaning},
  {key: 'car', label: 'Auto', tags: ['auto', 'samochod'], Icon: Car},
  {key: 'fuel', label: 'Paliwo', tags: ['paliwo', 'stacja'], Icon: Fuel},
];

const SHOPPING_LIST_ICON_BY_KEY = new Map(
  SHOPPING_LIST_ICONS.map(icon => [icon.key, icon]),
);

export function getShoppingListIconDefinition(
  iconKey: ShoppingListIconKey | null | undefined,
): ShoppingListIconDefinition {
  return (
    (iconKey ? SHOPPING_LIST_ICON_BY_KEY.get(iconKey) : undefined) ??
    SHOPPING_LIST_ICON_BY_KEY.get(DEFAULT_SHOPPING_LIST_ICON_KEY) ??
    SHOPPING_LIST_ICONS[0]
  );
}
