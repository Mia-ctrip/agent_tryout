// 在 app.json 之上补充构建期校验：EAS 云端/本地构建必须打入正式 HTTPS 后端地址，
// 避免把 10.0.2.2 / 127.0.0.1 回退地址或明文 HTTP 打进可分发的安装包。
module.exports = ({ config }) => {
  if (process.env.EAS_BUILD === 'true') {
    const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();
    if (!/^https:\/\/[^/\s]+/.test(apiUrl)) {
      throw new Error(
        'EXPO_PUBLIC_API_URL must be an https URL for EAS builds ' +
          '(set it with `eas env:create` for the preview/production environment).',
      );
    }
  }
  return config;
};
