import { Stack, router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { EditorialText } from '@/components/editorial-text';
import { ProductSearchPicker } from '@/components/product-search-picker';
import { productColors } from '@/constants/product-theme';
import { spacing } from '@/constants/theme';

export default function AddProductScreen() {
  return (
    <AppScreen
      variant="form"
      backgroundColor={productColors.background}
      contentStyle={styles.screenContent}
      safeAreaEdges={['left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackButtonDisplayMode: 'minimal',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: productColors.background },
          headerTintColor: productColors.actionPrimary,
          title: '添加产品',
        }}
      />
      <View style={styles.intro}>
        <EditorialText role="pageTitle" style={styles.title}>添加产品</EditorialText>
        <Text style={styles.description}>输入得越完整，匹配结果越准确</Text>
      </View>
      <ProductSearchPicker autoFocus onProductReady={() => router.back()} selectedProductIds={[]} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingHorizontal: 20, paddingTop: spacing.lg, paddingBottom: 56 },
  intro: { gap: 6, marginBottom: 22 },
  title: { color: productColors.textPrimary, fontSize: 28, lineHeight: 36, fontWeight: '400' },
  description: { color: productColors.textSecondary, fontSize: 13, lineHeight: 20 },
});
