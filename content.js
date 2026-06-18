// 学习通自动刷课插件 - 内容脚本
// 功能：自动播放视频、倍速播放、自动答题、下一章自动切换

class XueXiTongAutoPlayer {
  constructor() {
    this.isRunning = false;
    this.playbackSpeed = 1.5; // 默认倍速
    this.autoAnswer = true; // 自动答题
    this.answerMode = 'random'; // 答题模式：random | bank | ai
    this.apiUrl = ''; // AI API 地址
    this.apiKey = ''; // AI API 密钥
    this.currentVideo = null;
    this.observer = null;
    this.quizBank = null; // 本地题库
    this.init();
  }

  async init() {
    // 等待页面加载完成
    await this.waitForPageReady();
    // 加载用户设置
    await this.loadSettings();
    // 加载题库
    await this.loadQuizBank();
    // 开始监听视频
    this.startVideoObserver();
    // 初始化完成
    console.log('学习通自动刷课插件已启动', {
      isRunning: this.isRunning,
      playbackSpeed: this.playbackSpeed,
      autoAnswer: this.autoAnswer,
      answerMode: this.answerMode
    });
  }

  // 等待页面准备就绪
  async waitForPageReady() {
    return new Promise(resolve => {
      if (document.readyState === 'complete') {
        setTimeout(resolve, 1000); // 额外等待1秒确保元素加载
      } else {
        window.addEventListener('load', () => {
          setTimeout(resolve, 1000);
        });
      }
    });
  }

  // 从存储加载设置
  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get([
        'isRunning',
        'playbackSpeed',
        'autoAnswer',
        'answerMode',
        'apiUrl',
        'apiKey'
      ]);
      this.isRunning = result.isRunning ?? true;
      this.playbackSpeed = result.playbackSpeed ?? 1.5;
      this.autoAnswer = result.autoAnswer ?? true;
      this.answerMode = result.answerMode ?? 'random';
      this.apiUrl = result.apiUrl ?? '';
      this.apiKey = result.apiKey ?? '';
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  }

  // 加载本地题库
  async loadQuizBank() {
    try {
      const response = await fetch(chrome.runtime.getURL('quiz-bank.json'));
      if (response.ok) {
        this.quizBank = await response.json();
        console.log('题库加载成功，题目数量:', this.quizBank?.questions?.length || 0);
      }
    } catch (error) {
      console.log('题库加载失败:', error);
      this.quizBank = null;
    }
  }

  // 监听视频元素
  startVideoObserver() {
    // 初始检测
    this.detectAndSetupVideo();

    // 监听DOM变化，处理动态加载的视频
    this.observer = new MutationObserver(() => {
      this.detectAndSetupVideo();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // 检测并设置视频
  detectAndSetupVideo() {
    if (!this.isRunning) return;

    // 尝试多种选择器找到视频
    const videoSelectors = [
      'video',
      '.ans-attach-ct video',
      '.video  video',
      '#video',
      '.ans-video-player video'
    ];

    let video = null;
    for (const selector of videoSelectors) {
      video = document.querySelector(selector);
      if (video) break;
    }

    if (video && video !== this.currentVideo) {
      this.currentVideo = video;
      this.setupVideo(video);
    }
  }

  // 设置视频播放器
  setupVideo(video) {
    if (!video) return;

    // 设置播放速度
    video.playbackRate = this.playbackSpeed;

    // 如果视频未播放，自动播放
    if (video.paused && this.isRunning) {
      video.play().catch(err => {
        console.log('自动播放被阻止:', err);
      });
    }

    // 监听视频播放事件
    video.addEventListener('play', () => {
      video.playbackRate = this.playbackSpeed;
      this.onVideoPlay(video);
    });

    // 监听视频进度更新
    video.addEventListener('timeupdate', () => {
      this.onTimeUpdate(video);
    });

    // 监听视频结束
    video.addEventListener('ended', () => {
      this.onVideoEnded(video);
    });

    // 监听倍速设置
    video.addEventListener('ratechange', () => {
      if (video.playbackRate !== this.playbackSpeed) {
        video.playbackRate = this.playbackSpeed;
      }
    });
  }

  // 视频开始播放
  onVideoPlay(video) {
    console.log('视频开始播放，倍速:', this.playbackSpeed);
    // 持续确保倍速设置
    setInterval(() => {
      if (video.playbackRate !== this.playbackSpeed) {
        video.playbackRate = this.playbackSpeed;
      }
    }, 1000);
  }

  // 视频进度更新
  onTimeUpdate(video) {
    // 检测答题弹窗
    if (this.autoAnswer) {
      this.checkAndAnswerQuestion();
    }
  }

  // 检测并答题
  checkAndAnswerQuestion() {
    // 学习通答题弹窗的选择器
    const questionSelectors = [
      '.answer-tag', // 答题标签
      '.TiKu_dialog', // 题库弹窗
      '.ans-video-quiz', // 视频答题
      '.ans-paper-quiz', // 试卷答题
      '.quiz_option', // 答题选项
      'input[type="radio"]', // 单选按钮
      'input[type="checkbox"]' // 多选按钮
    ];

    let questionElement = null;
    for (const selector of questionSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        // 过滤掉隐藏的元素
        for (const el of elements) {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            questionElement = el;
            break;
          }
        }
        if (questionElement) break;
      }
    }

    if (questionElement) {
      this.autoAnswerQuestion();
    }
  }

  // 获取题目文本
  getQuestionText() {
    // 尝试多种选择器获取题目文本
    const questionSelectors = [
      '.quiz_question',
      '.question-title',
      '.question_text',
      '.ans-question-text',
      'h3',
      '.title'
    ];

    for (const selector of questionSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }
    return '';
  }

  // 模式1：随机答题
  answerRandomly() {
    try {
      const radios = document.querySelectorAll('input[type="radio"]');
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');

      if (radios.length > 0) {
        const randomIndex = Math.floor(Math.random() * radios.length);
        radios[randomIndex].click();
        console.log('自动答题（随机）：已选择单选答案');
      } else if (checkboxes.length > 0) {
        const indices = [];
        const numToSelect = Math.ceil(checkboxes.length / 2);
        while (indices.length < numToSelect) {
          const idx = Math.floor(Math.random() * checkboxes.length);
          if (!indices.includes(idx)) {
            indices.push(idx);
          }
        }
        indices.forEach(idx => checkboxes[idx].click());
        console.log('自动答题（随机）：已选择多选答案');
      }
      return true;
    } catch (error) {
      console.log('随机答题失败:', error);
      return false;
    }
  }

  // 模式2：题库答题
  answerFromBank(questionText) {
    if (!this.quizBank || !this.quizBank.questions) {
      console.log('题库为空或未加载， fallback 到随机答题');
      return this.answerRandomly();
    }

    try {
      // 关键词匹配
      const matchedQuestion = this.quizBank.questions.find(q => {
        if (!q.keywords || !Array.isArray(q.keywords)) return false;
        return q.keywords.some(keyword => questionText.includes(keyword));
      });

      if (matchedQuestion && matchedQuestion.answer) {
        const answer = matchedQuestion.answer.toUpperCase();
        const radios = document.querySelectorAll('input[type="radio"]');
        const checkboxes = document.querySelectorAll('input[type="checkbox"]');

        if (matchedQuestion.type === 'single' || radios.length > 0) {
          // 单选题：answer 应该是字母如 'A', 'B', 'C', 'D'
          const index = answer.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
          if (index >= 0 && index < radios.length) {
            radios[index].click();
            console.log('自动答题（题库）：已选择单选答案', answer);
            return true;
          }
        } else if (matchedQuestion.type === 'multiple' || checkboxes.length > 0) {
          // 多选题：answer 应该是字母组合如 'AB', 'ACD'
          for (let i = 0; i < answer.length; i++) {
            const index = answer.charCodeAt(i) - 65;
            if (index >= 0 && index < checkboxes.length) {
              checkboxes[index].click();
            }
          }
          console.log('自动答题（题库）：已选择多选答案', answer);
          return true;
        }
      }

      console.log('题库未找到匹配答案， fallback 到随机答题');
      return this.answerRandomly();
    } catch (error) {
      console.log('题库答题失败:', error);
      return this.answerRandomly();
    }
  }

  // 模式3：AI答题
  async answerWithAI(questionText) {
    if (!this.apiUrl || !this.apiKey) {
      console.log('AI API 未配置， fallback 到随机答题');
      return this.answerRandomly();
    }

    try {
      // 获取选项文本
      const options = this.getOptionsText();

      // 构建提示词
      const prompt = `请根据以下题目和选项，选择正确答案。

题目：${questionText}

选项：${options}

请直接回答正确答案的选项字母（如 A、B、C、D），如果是多选题请给出所有正确选项（如 AB、ACD）。只回答选项，不要其他解释。`;

      // 调用 AI API
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 50
        })
      });

      if (!response.ok) {
        throw new Error('AI API 请求失败');
      }

      const data = await response.json();
      const answer = data.choices?.[0]?.message?.content?.trim()?.toUpperCase() || '';

      if (answer) {
        this.selectAnswer(answer);
        console.log('自动答题（AI）：已选择答案', answer);
        return true;
      }

      console.log('AI 未返回有效答案， fallback 到随机答题');
      return this.answerRandomly();
    } catch (error) {
      console.log('AI 答题失败:', error);
      return this.answerRandomly();
    }
  }

  // 获取选项文本
  getOptionsText() {
    const options = [];
    const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

    // 尝试查找所有选项容器
    const optionContainers = document.querySelectorAll('li, .option-item, .quiz_option');

    optionContainers.forEach((container, index) => {
      const text = container.textContent.trim();
      if (text && text.length < 500) { // 过滤掉太长的文本
        options.push(`${optionLabels[index]}. ${text}`);
      }
    });

    return options.join('\n') || '无法获取选项';
  }

  // 选择答案
  selectAnswer(answer) {
    const answerUpper = answer.toUpperCase();
    const radios = document.querySelectorAll('input[type="radio"]');
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');

    if (answerUpper.length === 1 && radios.length > 0) {
      // 单选题
      const index = answerUpper.charCodeAt(0) - 65;
      if (index >= 0 && index < radios.length) {
        radios[index].click();
      }
    } else {
      // 多选题
      for (let i = 0; i < answerUpper.length; i++) {
        const index = answerUpper.charCodeAt(i) - 65;
        if (index >= 0 && index < checkboxes.length) {
          checkboxes[index].click();
        }
      }
    }
  }

  // 自动答题主函数
  async autoAnswerQuestion() {
    const questionText = this.getQuestionText();
    console.log('检测到题目:', questionText);

    let success = false;

    switch (this.answerMode) {
      case 'random':
        success = this.answerRandomly();
        break;
      case 'bank':
        success = this.answerFromBank(questionText);
        break;
      case 'ai':
        success = await this.answerWithAI(questionText);
        break;
      default:
        success = this.answerRandomly();
    }

    // 提交答案
    if (success) {
      setTimeout(() => {
        this.submitAnswer();
      }, 500);
    }
  }

  // 提交答案
  submitAnswer() {
    const confirmButtons = document.querySelectorAll('button');
    for (const btn of confirmButtons) {
      const text = btn.textContent?.trim();
      if (text === '确定' || text === '提交' || text === '下一题') {
        btn.click();
        console.log('已提交答案');
        break;
      }
    }
  }

  // 视频播放结束
  onVideoEnded(video) {
    console.log('视频播放完成');

    // 尝试自动切换到下一个视频/章节
    setTimeout(() => {
      this.goToNextChapter();
    }, 1500);
  }

  // 切换到下一章节
  goToNextChapter() {
    // 尝试多种选择器
    const nextButtonSelectors = [
      '.jb_btn.js-next',
      '.nextBtn',
      '.next_chapter',
      '.next',
      'button[data-type="next"]',
      'a[title="下一节"]',
      'div[aria-label="下一节"]',
      '.catalog_next'
    ];

    for (const selector of nextButtonSelectors) {
      const nextBtn = document.querySelector(selector);
      if (nextBtn) {
        console.log('找到下一章节按钮:', selector);
        nextBtn.click();
        // 等待视频加载
        setTimeout(() => {
          this.detectAndSetupVideo();
        }, 3000);
        break;
      }
    }
  }

  // 更新设置
  updateSettings(settings) {
    if (settings.isRunning !== undefined) {
      this.isRunning = settings.isRunning;
    }
    if (settings.playbackSpeed !== undefined) {
      this.playbackSpeed = settings.playbackSpeed;
    }
    if (settings.autoAnswer !== undefined) {
      this.autoAnswer = settings.autoAnswer;
    }
    if (settings.answerMode !== undefined) {
      this.answerMode = settings.answerMode;
    }
    if (settings.apiUrl !== undefined) {
      this.apiUrl = settings.apiUrl;
    }
    if (settings.apiKey !== undefined) {
      this.apiKey = settings.apiKey;
    }

    // 应用新的倍速设置
    if (this.currentVideo) {
      this.currentVideo.playbackRate = this.playbackSpeed;
    }

    console.log('设置已更新', {
      isRunning: this.isRunning,
      playbackSpeed: this.playbackSpeed,
      autoAnswer: this.autoAnswer,
      answerMode: this.answerMode
    });
  }
}

// 初始化插件
let autoPlayer = null;

// 等待DOM加载完成
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    autoPlayer = new XueXiTongAutoPlayer();
  });
} else {
  autoPlayer = new XueXiTongAutoPlayer();
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UPDATE_SETTINGS') {
    if (autoPlayer) {
      autoPlayer.updateSettings(message.settings);
      sendResponse({ success: true });
    }
  } else if (message.type === 'GET_STATUS') {
    sendResponse({
      isRunning: autoPlayer?.isRunning ?? false,
      playbackSpeed: autoPlayer?.playbackSpeed ?? 1.5,
      autoAnswer: autoPlayer?.autoAnswer ?? true,
      answerMode: autoPlayer?.answerMode ?? 'random',
      apiUrl: autoPlayer?.apiUrl ?? '',
      apiKey: autoPlayer?.apiKey ?? ''
    });
  }
  return true;
});
