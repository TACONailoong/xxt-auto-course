// 共享默认配置（popup 与 content script 共用）
// 注意：通过 manifest content_scripts / popup.html 分别加载，不依赖打包工具。

const XXT_DEFAULT_SETTINGS = {
  isRunning: true,
  playbackSpeed: 1.5,
  autoAnswer: true,
  mute: true,
  skipQuiz: true,
  autoNext: true
};

// 兼容不同加载环境（普通脚本 / 可能的模块上下文）
if (typeof globalThis !== 'undefined') {
  globalThis.XXT_DEFAULT_SETTINGS = XXT_DEFAULT_SETTINGS;
}
