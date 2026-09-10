import { StyleSheet, View } from 'react-native';

import { colors, radii } from '@/constants/theme';
import { buildBotanicalTraceModel } from '@/lib/quiet-visuals';
import type {
  BotanicalTraceIntensity,
  BotanicalTraceKind,
  BotanicalTracePlacement,
} from '@/lib/quiet-visuals';

type BotanicalTraceProps = {
  kind: BotanicalTraceKind;
  intensity?: BotanicalTraceIntensity;
  placement?: BotanicalTracePlacement;
  decorative?: true;
};

export function BotanicalTrace(props: BotanicalTraceProps) {
  const model = buildBotanicalTraceModel(props);
  return (
    <View
      accessibilityElementsHidden={model.accessibilityElementsHidden}
      accessible={model.accessible}
      importantForAccessibility={model.importantForAccessibility}
      pointerEvents={model.pointerEvents}
      style={[
        styles.root,
        styles[model.placement],
        { opacity: model.opacity },
      ]}>
      {model.kind === 'sprig' || model.kind === 'leaf-shadow' ? (
        <View style={[styles.sprig, model.kind === 'leaf-shadow' && styles.shadowSprig]}>
          <View style={styles.stem} />
          <View style={[styles.leaf, styles.leafOne]} />
          <View style={[styles.leaf, styles.leafTwo]} />
          <View style={[styles.leaf, styles.leafThree]} />
        </View>
      ) : null}
      {model.kind === 'paper-echo' ? (
        <>
          <View style={[styles.paper, styles.paperBack]} />
          <View style={[styles.paper, styles.paperFront]} />
        </>
      ) : null}
      {model.kind === 'bokeh' ? (
        <>
          <View style={[styles.bokeh, styles.bokehLarge]} />
          <View style={[styles.bokeh, styles.bokehSmall]} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', width: 168, height: 168 },
  topRight: { top: -36, right: -48 },
  bottomRight: { right: -48, bottom: -44 },
  bottomLeft: { bottom: -44, left: -48 },
  sprig: { width: '100%', height: '100%', transform: [{ rotate: '-18deg' }] },
  shadowSprig: { transform: [{ rotate: '24deg' }, { scale: 1.15 }] },
  stem: {
    position: 'absolute',
    top: 18,
    left: 82,
    width: 1,
    height: 142,
    backgroundColor: colors.moss,
    transform: [{ rotate: '28deg' }],
  },
  leaf: {
    position: 'absolute',
    width: 58,
    height: 22,
    borderRadius: radii.pill,
    backgroundColor: colors.sage,
  },
  leafOne: { top: 42, left: 68, transform: [{ rotate: '-12deg' }] },
  leafTwo: { top: 78, left: 34, transform: [{ rotate: '38deg' }] },
  leafThree: { top: 104, left: 84, transform: [{ rotate: '-22deg' }] },
  paper: {
    position: 'absolute',
    width: 126,
    height: 96,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    borderRadius: radii.lg,
    backgroundColor: colors.paperElevated,
  },
  paperBack: { top: 24, left: 14, transform: [{ rotate: '-8deg' }] },
  paperFront: { top: 48, left: 40, transform: [{ rotate: '6deg' }] },
  bokeh: { position: 'absolute', borderRadius: radii.pill },
  bokehLarge: { top: 14, right: 4, width: 116, height: 116, backgroundColor: colors.sageSoft },
  bokehSmall: { bottom: 8, left: 12, width: 72, height: 72, backgroundColor: colors.amber },
});
