import type { ConsentType } from '@/lib/auth-types';

export const consentCopy: Record<ConsentType, { title: string; description: string }> = {
  terms: {
    title: '用户协议',
    description: '明确账号、服务边界与使用规则。',
  },
  privacy: {
    title: '隐私政策',
    description: '说明照片、日记和账号数据如何收集、存储与删除。',
  },
  health_disclaimer: {
    title: '健康免责声明',
    description: '结果只描述外观变化，不构成诊断，也不替代专业医疗建议。',
  },
  ai_processing: {
    title: 'AI 数据处理说明',
    description: '允许系统为生成分析结果处理你主动上传的皮肤照片。',
  },
};
