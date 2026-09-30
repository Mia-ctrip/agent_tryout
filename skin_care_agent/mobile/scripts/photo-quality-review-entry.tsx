// Isolated component preview, served only by ui-visual-review.mjs --quality-only.
// This is not an app route and never calls the backend or persists a photo.
import { registerRootComponent } from 'expo';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PhotoQualityReview } from '../src/components/photo-quality-review';

function Preview() {
  const params = new URLSearchParams(window.location.search);
  const scenario = params.get('state');
  const [state, setState] = useState<'checking' | 'needs_adjustment' | 'unavailable'>(
    scenario === 'checking' || scenario === 'unavailable' ? scenario : 'needs_adjustment',
  );
  return <SafeAreaProvider initialMetrics={{
    frame: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
  }}>
    <PhotoQualityReview state={state} photoUri={new URL('/photo', window.location.href).href}
      source={params.get('source') === 'library' ? 'library' : 'camera'}
      issue={{ code: 'blurry', message: '照片有些模糊，请保持手机稳定' }}
      error="连接暂时中断，请稍后重试。" choosingPhoto={params.has('busy')}
      onRetry={() => { document.body.dataset.action = 'retry'; setState('checking'); }}
      onReplace={() => { document.body.dataset.action = 'replace'; }}
      onBack={() => { document.body.dataset.action = 'back'; }} />
  </SafeAreaProvider>;
}

registerRootComponent(Preview);
