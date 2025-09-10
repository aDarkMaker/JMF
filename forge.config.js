const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: {
      unpack: "core/**/*" // 确保core目录不被打包到asar中，以便Python脚本可以正常访问
    },
    icon: './assets/icon/icon.ico',
    extraResource: [
      "./core", // 将core目录作为额外资源包含
      "./PDF"   // 确保PDF输出目录存在
    ],
    // 忽略不必要的文件以减小包大小
    ignore: [
      /^\/\.git/,
      /^\/node_modules\/.*\/test/,
      /^\/node_modules\/.*\/tests/,
      /^\/node_modules\/.*\/\.nyc_output/,
      /^\/node_modules\/.*\/coverage/,
      /^\/src\/.*\.ts$/,
      /^\/\.vscode/,
      /^\/\.github/
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: "JMcomic_Fetcher",
        setupIcon: './assets/icon/icon.ico',
        loadingGif: './assets/icon/icon.png'
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          icon: './assets/icon/icon.png',
          name: 'jmcomic-fetcher',
          productName: 'JMcomic Fetcher',
          maintainer: 'Orange',
          description: 'JMcomic漫画下载工具'
        }
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          icon: './assets/icon/icon.png',
          name: 'jmcomic-fetcher',
          productName: 'JMcomic Fetcher',
          maintainer: 'Orange',
          description: 'JMcomic漫画下载工具'
        }
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
