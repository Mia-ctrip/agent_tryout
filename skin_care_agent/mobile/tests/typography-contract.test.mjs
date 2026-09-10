import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTypography,
  typographyRoleStyle,
} from '../src/constants/typography.ts';

test('typography uses a platform-safe serif only for editorial heading roles', () => {
  const android = createTypography('android');
  const ios = createTypography('ios');
  const web = createTypography('web');

  assert.equal(android.displayFamily, 'serif');
  assert.equal(android.bodyFamily, 'sans-serif');
  assert.equal(ios.displayFamily, 'Georgia');
  assert.equal(ios.bodyFamily, 'System');
  assert.match(web.displayFamily, /Georgia.*Noto Serif SC.*SimSun.*serif/);
  assert.equal(web.bodyFamily, 'system-ui');

  for (const role of ['display', 'pageTitle', 'sectionTitle']) {
    assert.equal(typographyRoleStyle(android, role).fontFamily, android.displayFamily);
  }
  for (const role of ['body', 'caption', 'metadata']) {
    assert.notEqual(typographyRoleStyle(android, role).fontFamily, android.displayFamily);
  }
});

test('typography roles keep readable body rhythm and restrained metadata', () => {
  const type = createTypography('android');

  assert.deepEqual(
    {
      pageTitle: [type.pageTitle.fontSize, type.pageTitle.lineHeight],
      body: [type.body.fontSize, type.body.lineHeight],
      caption: [type.caption.fontSize, type.caption.lineHeight],
      metadata: [type.metadata.fontSize, type.metadata.lineHeight],
    },
    {
      pageTitle: [30, 38],
      body: [15, 24],
      caption: [13, 20],
      metadata: [11, 16],
    },
  );
  assert.ok(type.body.fontWeight !== '300');
  assert.ok(type.caption.fontSize >= 12);
});
