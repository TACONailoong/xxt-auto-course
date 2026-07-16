// 模拟学习通课程页结构：顶层目录 + 步骤页签 + iframe 视频 + 答题弹窗钩子
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const VIDEO = path.join(__dirname, 'fixtures', 'test.webm');

const framePage = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>video-frame</title></head>
<body>
  <button title="播放视频" id="playOverlay">播放</button>
  <video id="video_html5_api" width="320" height="240" src="/video.webm"></video>
  <div class="ans-videoquiz" id="quiz" style="display:none;width:200px;height:120px;">
    <input type="radio" name="q1" value="a"> A
    <input type="radio" name="q1" value="b"> B
    <button class="ans-videoquiz-submit">提交</button>
  </div>
  <script>
    document.getElementById('playOverlay').onclick = () => {
      document.getElementById('video_html5_api').play();
    };
    // 暴露给测试：显示答题弹窗
    window.__showQuiz = () => {
      document.getElementById('quiz').style.display = 'block';
    };
  </script>
</body></html>`;

const topPage = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>课程页</title></head>
<body>
  <h1>模拟学习通课程页</h1>
  <div class="prev_title" title="学习目标">学习目标</div>
  <div class="prev_white" id="videoTab">2视频</div>
  <div id="coursetree">
    <ul>
      <li>
        <div class="posCatalog_select firstLayer"><span class="posCatalog_name" title="第一章">第一章</span></div>
        <div class="posCatalog_select posCatalog_active">
          <span class="posCatalog_name" title="1.1 第一课">1.1 第一课</span>
          <span class="prevHoverTips">未完成</span>
        </div>
        <div class="posCatalog_select" id="nextItem">
          <span class="posCatalog_name" title="1.2 第二课">1.2 第二课</span>
          <span class="prevHoverTips">未完成</span>
        </div>
      </li>
    </ul>
  </div>
  <button id="prevNextFocusNext" style="display:none">下一节</button>
  <iframe src="/frame" width="400" height="300"></iframe>
  <script>
    document.getElementById('videoTab').onclick = () => {
      document.querySelector('.prev_title').title = '视频';
      document.querySelector('.prev_title').textContent = '视频';
    };
    let nextClicks = 0;
    document.getElementById('prevNextFocusNext').onclick = () => { nextClicks++; window.__nextClicks = nextClicks; };
    document.getElementById('nextItem').querySelector('.posCatalog_name').onclick = () => {
      window.__catalogClicked = true;
    };
  </script>
</body></html>`;

const quizPage = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>测验页</title></head>
<body>
  <div class="prev_title" title="章节测验">章节测验</div>
  <button id="prevNextFocusNext">下一节</button>
  <div id="coursetree"><ul><li></li></ul></div>
  <script>
    window.__nextClicks = 0;
    document.getElementById('prevNextFocusNext').onclick = () => { window.__nextClicks++; };
  </script>
</body></html>`;

http
  .createServer((req, res) => {
    if (req.url.startsWith('/video.webm')) {
      res.setHeader('Content-Type', 'video/webm');
      fs.createReadStream(VIDEO).pipe(res);
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.url.startsWith('/frame')) res.end(framePage);
    else if (req.url.startsWith('/quiz')) res.end(quizPage);
    else res.end(topPage);
  })
  .listen(PORT, () => console.log('mock server ready on', PORT));
