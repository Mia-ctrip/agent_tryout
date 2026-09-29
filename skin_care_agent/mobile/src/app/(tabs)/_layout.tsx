import { Tabs, usePathname } from 'expo-router';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/constants/theme';
import { journeyColors } from '@/constants/journey-theme';
import { TAB_SPECS, tabVisualState } from '@/lib/tab-shell';
import { svgDataUri } from '@/lib/face-analysis-visual';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const journey = usePathname() === '/history';
  const archive = usePathname() === '/products';
  const journeyIcons = {
    observe: '<path d="M12 22V10M12 15C3 15 3 8 3 5c7 0 9 5 9 10ZM12 11c0-6 4-9 9-9 0 7-3 10-9 9ZM7 22h10"/>',
    history: '<path d="M5 5a9 9 0 1 1-2 10M3 3v6h6M12 6v6l4 2"/>',
    products: '<path d="M9 2h6v5H9zM9 7l-4 5v10h14V12l-4-5M5 12h14"/>',
    me: '<circle cx="12" cy="6" r="4"/><path d="M3 22v-3c0-7 18-7 18 0v3"/>',
  };
  const archiveIcons = {
    observe: '<path d="M3 6h4l2-3h6l2 3h4v15H3z"/><circle cx="12" cy="13" r="4"/>',
    history: journeyIcons.history,
    products: '<rect x="2" y="2" width="20" height="5" rx="1"/><path d="M4 7v15h16V7M10 12h4"/>',
    me: '<circle cx="12" cy="6" r="4"/><path d="M3 22v-3c0-7 18-7 18 0v3Z"/>',
  };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.mossDeep,
        tabBarInactiveTintColor: colors.muted,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: archive ? colors.paper : journey ? journeyColors.background : colors.paperElevated,
          ...(archive ? { borderTopWidth: 0, elevation: 0, shadowOpacity: 0 } : {}),
          borderTopColor: journey ? journeyColors.line : colors.hairline,
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
              const visual = { ...tabVisualState(focused), ...(archive ? { color: focused ? colors.mossDeep : `${colors.earth}99` } : {}) };
              return <Text style={[styles.label, { color: visual.color, fontWeight: visual.fontWeight }]}>{tab.label}</Text>;
            },
            tabBarIcon: ({ focused, size }) => {
              const visual = { ...tabVisualState(focused), ...(archive ? { color: focused ? colors.mossDeep : `${colors.earth}99` } : {}) };
              return (
                <View style={styles.iconWrap}>
                  {journey || archive ? <Image source={{ uri: svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + visual.color + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + (archive ? archiveIcons : journeyIcons)[tab.route] + '</svg>') }} style={{ width: size, height: size }} /> : <SymbolView
                    name={tab.symbol}
                    size={size}
                    tintColor={visual.color}
                    weight={focused ? 'semibold' : 'regular'}
                  />}
                  {!archive && <View style={[styles.indicator, { opacity: visual.indicatorOpacity }]} />}
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
