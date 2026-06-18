// 学习通自动刷课插件 - 背景脚本

// 监听插件安装或更新
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // 插件首次安装
    console.log('学习通自动刷课助手已安装');

    // 设置默认配置
    chrome.storage.sync.set({
      isRunning: true,
      playbackSpeed: 1.5,
      autoAnswer: true
    });
  } else if (details.reason === 'update') {
    // 插件更新
    console.log('学习通自动刷课助手已更新到新版本');
  }
});

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'LOG') {
    console.log('[Content Script]', message.message);
  } else if (message.type === 'GET_SETTINGS') {
    chrome.storage.sync.get(['isRunning', 'playbackSpeed', 'autoAnswer']).then(result => {
      sendResponse(result);
    });
    return true; // 保持消息通道打开以便异步响应
  }
});

// 监听标签页更新，以便在用户切换到学习通页面时激活插件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // 检查是否是学习通域名
    const isChaoxing = tab.url.includes('chaoxing.com') || tab.url.includes('fx361.com');

    if (isChaoxing) {
      // 向标签页发送激活消息
      chrome.tabs.sendMessage(tabId, {
        type: 'TAB_ACTIVATED',
        url: tab.url
      }).catch(err => {
        // 忽略错误，可能是内容脚本还没加载
      });
    }
  }
});

// 监听标签页激活
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && (tab.url.includes('chaoxing.com') || tab.url.includes('fx361.com'))) {
      // 发送激活消息
      chrome.tabs.sendMessage(activeInfo.tabId, {
        type: 'TAB_ACTIVATED',
        url: tab.url
      }).catch(err => {
        // 忽略错误
      });
    }
  } catch (error) {
    console.error('获取标签页信息失败:', error);
  }
});
