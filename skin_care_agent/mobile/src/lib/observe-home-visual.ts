type EditorialCollageInput = {
  primaryRegistered: boolean;
  secondaryRegistered: boolean;
  imageDose: 'hero';
};

export function buildEditorialCollageModel({
  primaryRegistered,
  secondaryRegistered,
  imageDose,
}: EditorialCollageInput) {
  const licensedAssetsReady = primaryRegistered && secondaryRegistered;
  return {
    itemCount: 2,
    imageDose,
    licensedAssetsReady,
    renderPlaceholder: !licensedAssetsReady,
    accessibilitySummary: licensedAssetsReady
      ? '两张已登记品牌影像组成的编辑拼贴'
      : '品牌影像位置暂以纸面构图呈现',
  };
}
