import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { colors } from '@/constants/theme';
import { TAB_SPECS } from '@/lib/tab-shell';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.irisStrong,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        tabBarStyle: {
          backgroundColor: colors.warmWhite,
          borderTopColor: colors.border,
          paddingTop: 6,
        },
      }}>
      {TAB_SPECS.map((tab) => (
        <Tabs.Screen
          key={tab.route}
          name={tab.route}
          options={{
            title: tab.label,
            tabBarIcon: ({ color, size }) => (
              <SymbolView
                name={tab.symbol}
                size={size}
                tintColor={color}
                weight="medium"
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
