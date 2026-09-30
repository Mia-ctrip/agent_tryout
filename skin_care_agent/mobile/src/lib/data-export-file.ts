import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import type { DataExportPayload } from '@/lib/export-api.ts';

function exportFileName(payload: DataExportPayload): string {
  const stamp = payload.generated_at.replace(/[^0-9]/g, '');
  return `skin-care-data-export-${stamp}.json`;
}

export async function saveDataExportFile(payload: DataExportPayload): Promise<string> {
  const json = JSON.stringify(payload, null, 2);
  const fileName = exportFileName(payload);

  if (Platform.OS === 'web') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
    } finally {
      URL.revokeObjectURL(url);
    }
    return '已开始下载到浏览器默认下载位置';
  }

  const file = new File(Paths.document, fileName);
  file.create({ overwrite: true });
  file.write(json);
  return file.uri;
}
