import type { TextProps } from 'react-native';
import { Platform, Text } from 'react-native';

import {
  createTypography,
  typographyRoleStyle,
} from '@/constants/typography';
import type { TypographyPlatform, TypographyRole } from '@/constants/typography';

type EditorialTextProps = Omit<TextProps, 'role'> & {
  role: TypographyRole;
};

const platformTypography = createTypography(Platform.OS as TypographyPlatform);

export function EditorialText(props: EditorialTextProps) {
  const role = props.role;
  const textProps = Object.assign({}, props) as Omit<TextProps, 'role'> & {
    role?: TypographyRole;
  };
  delete textProps.role;
  const nativeProps = textProps as Omit<TextProps, 'role'>;
  return (
    <Text
      {...nativeProps}
      style={[typographyRoleStyle(platformTypography, role), props.style, { fontFamily: typographyRoleStyle(platformTypography, role).fontFamily }]}
    />
  );
}
