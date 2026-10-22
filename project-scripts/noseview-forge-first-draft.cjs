module.exports = {
  packagerConfig: {
    asar: true, name: 'NoseView', executableName: 'NoseView', appBundleId: 'local.noseview.prototype', icon: 'public/assets/app-icon',
    appCategoryType: 'public.app-category.healthcare-fitness',
    extendInfo: { NSCameraUsageDescription: 'NoseView는 코 윤곽을 실시간으로 비교하기 위해 사용자가 선택한 웹캠을 사용합니다. 영상은 자동 저장되지 않습니다.' },
    ignore: [/^\/(?!dist(?:\/|$)|desktop(?:\/|$)|package\.json$|THIRD_PARTY_NOTICES\.md$|licenses(?:\/|$)).*/],
    prune: true,
  },
  makers: [{ name: '@electron-forge/maker-zip', platforms: ['darwin', 'win32'] }],
};
