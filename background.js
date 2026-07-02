// 学习通自动刷课插件 - 背景脚本
// 职责：首次安装时写入默认配置。设置的实时同步由 storage.onChanged 完成，
// 无需在后台转发消息。

chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      isRunning: true,
      playbackSpeed: 1.5,
      autoAnswer: true
    });
    console.log('学习通自动刷课助手已安装');
  } else if (details.reason === 'update') {
    console.log('学习通自动刷课助手已更新到', chrome.runtime.getManifest().version);
  }
});
