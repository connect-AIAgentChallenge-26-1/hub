import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const router = Router();
const execAsync = promisify(exec);

// 크롤러 실행 엔드포인트
router.post('/run', async (req, res) => {
  try {
    // 간단한 보안: 환경변수로 토큰 검증 (선택)
    const token = req.headers['x-crawler-token'];
    const expectedToken = process.env.CRAWLER_TOKEN;

    if (expectedToken && token !== expectedToken) {
      return res.status(401).json({ error: '인증 실패' });
    }

    // 크롤러 실행 (백그라운드, 응답 기다리지 않음)
    res.json({
      status: 'started',
      message: '크롤러가 시작되었습니다. 진행 상황은 Render 로그에서 확인하세요.',
    });

    // 백그라운드에서 실행
    exec('cd /app && python crawler/main.py', (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ 크롤러 오류: ${error.message}`);
        console.error(stderr);
        return;
      }
      console.log('✅ 크롤러 완료');
      console.log(stdout);
    });
  } catch (error) {
    console.error('크롤러 실행 오류:', error);
    res.status(500).json({ error: '크롤러 실행 실패' });
  }
});

// 상태 확인 엔드포인트 (나중에 확장 가능)
router.get('/status', (req, res) => {
  res.json({
    status: 'healthy',
    crawler: 'available',
  });
});

export default router;
