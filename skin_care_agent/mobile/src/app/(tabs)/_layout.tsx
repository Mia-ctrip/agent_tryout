import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/constants/theme';
import { TAB_SPECS, tabVisualState } from '@/lib/tab-shell';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.mossDeep,
        tabBarInactiveTintColor: colors.muted,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: colors.paperElevated,
          borderTopColor: colors.hairline,
          paddingTop: 6,
          height: 64 + insets.bottom,
          paddingBottom: Math.max(8, insets.bottom),
        },
      }}>
      {TAB_SPECS.map((tab) => (
        <Tabs.Screen
          key={tab.route}
          name={tab.route}
          options={{
            title: tab.label,
            tabBarLabel: ({ focused }) => {
              const visual = tabVisualState(focused);
              return <Text style={[styles.label, { color: visual.color, fontWeight: visual.fontWeight }]}>{tab.label}</Text>;
            },
            tabBarIcon: ({ focused, size }) => {
              const visual = tabVisualState(focused);
              return (
                <View style={styles.iconWrap}>
                  <SymbolView
                    name={tab.symbol}
                    size={size}
                    tintColor={visual.color}
                    weight={focused ? 'semibold' : 'regular'}
                  />
                  <View style={[styles.indicator, { opacity: visual.indicatorOpacity }]} />
                </View>
              );
            },
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12 },
  iconWrap: { alignItems: 'center', gap: 3 },
  indicator: { width: 18, height: 2, borderRadius: 1, backgroundColor: colors.mossDeep },
});
