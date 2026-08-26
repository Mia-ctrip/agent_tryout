import type { AndroidSymbol, SFSymbol } from 'expo-symbols';

export type MvpTabRoute = 'observe' | 'history' | 'products' | 'me';

export type MvpTabSpec = {
  route: MvpTabRoute;
  label: string;
  symbol: {
    ios: SFSymbol;
    android: AndroidSymbol;
    web: AndroidSymbol;
  };
};

export const TAB_SPECS: readonly MvpTabSpec[] = [
  {
    route: 'observe',
    label: '观察',
    symbol: {
      ios: 'camera.viewfinder',
      android: 'photo_camera',
      web: 'photo_camera',
    },
  },
  {
    route: 'history',
    label: '历程',
    symbol: {
      ios: 'clock.arrow.circlepath',
      android: 'history',
      web: 'history',
    },
  },
  {
    route: 'products',
    label: '产品',
    symbol: {
      ios: 'shippingbox',
      android: 'inventory_2',
      web: 'inventory_2',
    },
  },
  {
    route: 'me',
    label: '我的',
    symbol: {
      ios: 'person.crop.circle',
      android: 'person',
      web: 'person',
    },
  },
] as const;
