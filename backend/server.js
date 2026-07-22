const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const axios = require('axios');
const ical = require('node-ical');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const proj4 = require('proj4');
const nodemailer = require('nodemailer');
require('dotenv').config();

proj4.defs("KATECH", "+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 +ellps=bessel +units=m +no_defs +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43");
proj4.defs("WGS84", "+proj=longlat +datum=WGS84 +no_defs");

// Mongoose Models
const User = require('./models/User');
const Room = require('./models/Room');
const Schedule = require('./models/Schedule');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected successfully'))
    .catch((err) => console.error('❌ MongoDB connection error:', err));
} else {
  console.log('⚠️ MONGODB_URI env variable is not set. Database operations will fail.');
}

// Mock Data for Fallbacks
const MOCK_RESTAURANTS = [
  { id: 'r1', name: '청춘 돼지불백', category: '한식/고기', rating: 4.8, distance: '정문 도보 3분', menu: '돼지불백 정식', emoji: '🥩' },
  { id: 'r2', name: '미도리 스시', category: '일식/회', rating: 4.9, distance: '서문 도보 5분', menu: '모듬초밥 10p', emoji: '🍣' },
  { id: 'r3', name: '롤링 파스타', category: '양식/파스타', rating: 4.6, distance: '동문 도보 4분', menu: '매운 크림 파스타', emoji: '🍝' },
  { id: 'r4', name: '소림 마라탕', category: '중식/마라탕', rating: 4.7, distance: '정문 도보 2분', menu: '마라탕 & 꿔바로우', emoji: '🍜' },
  { id: 'r5', name: '카페 아늑', category: '디저트/카페', rating: 4.5, distance: '서문 도보 1분', menu: '아인슈페너 & 와플', emoji: '☕' }
];

// ==========================================
// Scheduling & Free Slots Calculation Logic
// ==========================================
const KST_OFFSET_MS = 9 * 60 * 60 * 1000; // UTC+9

function calculateFreeSlots(busyEvents) {
  const DAYS = ['월', '화', '수', '목', '금'];
  const DAY_MAP = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금' };
  const SLOTS = [
    { id: 1, start: 9 * 60, end: 10 * 60 },
    { id: 2, start: 10 * 60, end: 11 * 60 },
    { id: 3, start: 11 * 60, end: 12 * 60 },
    { id: 4, start: 12 * 60, end: 13 * 60 },
    { id: 5, start: 13 * 60, end: 14 * 60 },
    { id: 6, start: 14 * 60, end: 15 * 60 },
    { id: 7, start: 15 * 60, end: 16 * 60 },
    { id: 8, start: 16 * 60, end: 17 * 60 },
    { id: 9, start: 17 * 60, end: 18 * 60 },
  ];

  const busySlots = new Set();

  busyEvents.forEach(event => {
    // All busyEvents are stored as proper UTC; convert to KST for slot matching
    const startUTC = new Date(event.start);
    const endUTC = new Date(event.end);
    const startKST = new Date(startUTC.getTime() + KST_OFFSET_MS);
    const endKST = new Date(endUTC.getTime() + KST_OFFSET_MS);

    const dayNum = startKST.getUTCDay(); // 0=Sun, 1=Mon, ... in KST
    if (dayNum < 1 || dayNum > 5) return;
    const dayChar = DAY_MAP[dayNum];

    const startMins = startKST.getUTCHours() * 60 + startKST.getUTCMinutes();
    const endMins = endKST.getUTCHours() * 60 + endKST.getUTCMinutes();

    SLOTS.forEach(slot => {
      if (startMins < slot.end && endMins > slot.start) {
        busySlots.add(`${dayChar}-${slot.id}`);
      }
    });
  });

  const freeSlots = [];
  DAYS.forEach(day => {
    for (let id = 1; id <= 9; id++) {
      const key = `${day}-${id}`;
      if (!busySlots.has(key)) {
        freeSlots.push(key);
      }
    }
  });

  return freeSlots;
}

// Helpers for restaurant proxy
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const phi1 = lat1 * Math.PI/180;
  const phi2 = lat2 * Math.PI/180;
  const deltaPhi = (lat2-lat1) * Math.PI/180;
  const deltaLambda = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function calculateWalkDuration(address, item, userLat, userLng) {
  if (userLat && userLng && item && item.mapx && item.mapy) {
    try {
      const mapx = parseInt(item.mapx);
      const mapy = parseInt(item.mapy);
      if (!isNaN(mapx) && !isNaN(mapy)) {
        // Naver Search API returns WGS84 coordinates multiplied by 10^7
        const lng = mapx / 10000000;
        const lat = mapy / 10000000;
        
        const distMeters = calculateHaversineDistance(parseFloat(userLat), parseFloat(userLng), lat, lng);
        
        if (!isNaN(distMeters)) {
          const mins = Math.max(1, Math.ceil(distMeters / 80));
          return `현위치 도보 ${mins}분 (${Math.round(distMeters)}m)`;
        }
      }
    } catch (e) {
      console.warn("Coordinate conversion failed", e.message);
    }
  }

  const gates = ["정문", "서문", "동문"];
  const gate = gates[Math.floor(Math.random() * gates.length)];
  const mins = Math.floor(Math.random() * 6) + 2; // 2 to 7 mins
  return `${gate} 도보 ${mins}분`;
}

function getEmojiByCategory(category) {
  if (!category) return '🍱';
  if (category.includes('한식') || category.includes('고기') || category.includes('찌개')) return '🥩';
  if (category.includes('일식') || category.includes('스시') || category.includes('초밥') || category.includes('회')) return '🍣';
  if (category.includes('중식') || category.includes('마라탕') || category.includes('짜장면')) return '🍜';
  if (category.includes('양식') || category.includes('파스타') || category.includes('피자') || category.includes('이탈리안')) return '🍝';
  if (category.includes('카페') || category.includes('디저트') || category.includes('커피')) return '☕';
  return '🍱';
}

// ==========================================
// API Routes
// ==========================================

// ==========================================
// Email Verification (Nodemailer)
// ==========================================
const verificationCodes = {};

const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

app.post('/api/auth/send-code', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: '이메일을 입력해주세요.' });
  }

  const code = Math.floor(1000 + Math.random() * 9000).toString();
  verificationCodes[email] = { code, expiresAt: Date.now() + 5 * 60 * 1000 };

  try {
    await emailTransporter.sendMail({
      from: `"잇다" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '[잇다] 이메일 인증 코드',
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #f97316;">잇다 이메일 인증</h2>
          <p>아래 인증 코드를 입력해주세요.</p>
          <div style="background: #fff7ed; border: 2px solid #f97316; border-radius: 12px; padding: 20px; text-align: center; margin: 16px 0;">
            <span style="font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #ea580c;">${code}</span>
          </div>
          <p style="color: #94a3b8; font-size: 12px;">이 코드는 5분간 유효합니다.</p>
        </div>
      `
    });
    console.log(`📧 Verification code sent to ${email}: ${code}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Email send failed:', error.message);
    res.status(500).json({ success: false, error: '이메일 발송에 실패했습니다.' });
  }
});

app.post('/api/auth/verify-code', (req, res) => {
  const { email, code } = req.body;
  const record = verificationCodes[email];

  if (!record) {
    return res.json({ success: false, error: '인증 코드를 먼저 요청해주세요.' });
  }
  if (Date.now() > record.expiresAt) {
    delete verificationCodes[email];
    return res.json({ success: false, error: '인증 코드가 만료되었습니다. 다시 요청해주세요.' });
  }
  if (record.code !== code) {
    return res.json({ success: false, error: '인증 코드가 일치하지 않습니다.' });
  }

  delete verificationCodes[email];
  res.json({ success: true });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Bab-Jjak backend server is running!' });
});

// 1. Google Calendar Sync API
app.post('/api/schedule/sync/google', async (req, res) => {
  const { accessToken } = req.body;
  if (!accessToken) {
    return res.status(400).json({ success: false, error: 'Access token is required' });
  }

  try {
    const now = new Date();
    const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const response = await axios.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        timeMin: now.toISOString(),
        timeMax: twoWeeksLater.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      }
    });

    const events = response.data.items || [];
    const busyEvents = events.map(e => ({
      start: e.start.dateTime || e.start.date,
      end: e.end.dateTime || e.end.date
    }));

    const freeSlots = calculateFreeSlots(busyEvents);
    res.json({ success: true, freeSlots });
  } catch (error) {
    console.error('Error fetching Google Calendar:', error.message);
    res.status(500).json({ success: false, error: 'Failed to sync Google Calendar' });
  }
});

// 2. Apple Calendar (iCloud CalDAV) Sync API
app.post('/api/schedule/sync/ical', async (req, res) => {
  const { appleId, appPassword } = req.body;
  if (!appleId || !appPassword) {
    return res.status(400).json({ success: false, error: 'Apple ID와 앱 암호가 필요합니다.' });
  }

  try {
    const { DAVClient } = await import('tsdav');

    const client = new DAVClient({
      serverUrl: 'https://caldav.icloud.com',
      credentials: { username: appleId, password: appPassword },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });

    await client.login();

    const calendars = await client.fetchCalendars();
    if (!calendars || calendars.length === 0) {
      return res.status(404).json({ success: false, error: '캘린더를 찾을 수 없습니다.' });
    }

    const now = new Date();
    const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const busyEvents = [];

    for (const calendar of calendars) {
      const objects = await client.fetchCalendarObjects({
        calendar,
        timeRange: {
          start: now.toISOString(),
          end: twoWeeksLater.toISOString(),
        },
      });

      for (const obj of objects) {
        const parsed = ical.parseICS(obj.data);
        for (const k in parsed) {
          if (parsed[k].type === 'VEVENT') {
            const start = new Date(parsed[k].start);
            const end = new Date(parsed[k].end);
            if (start >= now && start <= twoWeeksLater) {
              busyEvents.push({ start, end });
            }
          }
        }
      }
    }

    const freeSlots = calculateFreeSlots(busyEvents);
    res.json({ success: true, freeSlots, calendarCount: calendars.length });
  } catch (error) {
    console.error('Error syncing iCloud CalDAV:', error.message);
    if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      return res.status(401).json({ success: false, error: 'Apple ID 또는 앱 암호가 잘못되었습니다.' });
    }
    res.status(500).json({ success: false, error: 'iCloud 캘린더 동기화에 실패했습니다.' });
  }
});

// 3. Everytime (에브리타임) URL Scraping API
app.post('/api/schedule/sync/everytime', async (req, res) => {
  const { everytimeUrl } = req.body;
  if (!everytimeUrl) {
    return res.status(400).json({ success: false, error: 'Everytime share URL is required' });
  }

  try {
    const match = everytimeUrl.match(/@([A-Za-z0-9]+)/);
    const identifier = match ? match[1] : everytimeUrl.split('/').pop();

    const params = new URLSearchParams();
    params.append('identifier', identifier);
    params.append('friendInfo', 'true');

    const response = await axios.post('https://api.everytime.kr/find/timetable/table/friend', params.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://everytime.kr',
        'Referer': 'https://everytime.kr/'
      }
    });

    const $ = cheerio.load(response.data, { xmlMode: true });
    const weeklySchedule = []; // { day: 0-4, startHour, startMin, endHour, endMin }

    $('subject').each((_, subj) => {
      $(subj).find('data').each((_, data) => {
        const day = parseInt($(data).attr('day'));
        const starttime = parseInt($(data).attr('starttime')); 
        const endtime = parseInt($(data).attr('endtime')); 

        if (!isNaN(day) && !isNaN(starttime) && !isNaN(endtime)) {
          const startMins = starttime * 5;
          const endMins = endtime * 5;
          
          const startHour = Math.floor(startMins / 60);
          const startMin = startMins % 60;
          const endHour = Math.floor(endMins / 60);
          const endMin = endMins % 60;
          
          weeklySchedule.push({ day, startHour, startMin, endHour, endMin });
        }
      });
    });

    if (weeklySchedule.length === 0) {
      return res.status(400).json({
        success: false,
        error: '시간표를 찾을 수 없거나 파싱에 실패했습니다. 올바른 에브리타임 공유 URL인지 확인해 주세요.'
      });
    }

    // Convert weekly schedule to busy events for the next 2 weeks
    const busyEvents = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const targetDate = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
      const jsDay = targetDate.getDay(); // 0=Sun, 1=Mon, ...
      if (jsDay < 1 || jsDay > 5) continue;
      const etDay = jsDay - 1; // 0=Mon, 1=Tue, ...

      weeklySchedule
        .filter(s => s.day === etDay)
        .forEach(s => {
          // Class times are KST — store as proper UTC by subtracting 9 hours
          const dayMidnightUTC = Date.UTC(
            targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()
          );
          const start = new Date(dayMidnightUTC + s.startHour * 3600000 + s.startMin * 60000 - KST_OFFSET_MS);
          const end = new Date(dayMidnightUTC + s.endHour * 3600000 + s.endMin * 60000 - KST_OFFSET_MS);
          busyEvents.push({ start, end });
        });
    }

    const freeSlots = calculateFreeSlots(busyEvents);
    res.json({ success: true, freeSlots, parsedClasses: weeklySchedule.length });
  } catch (error) {
    console.error('Error fetching Everytime:', error.message);
    res.status(500).json({ success: false, error: '에브리타임 동기화에 실패했습니다.' });
  }
});

// 4. Naver Search API Proxy
app.get('/api/restaurants/search', async (req, res) => {
  const { query, sort, lat, lng } = req.query;
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn('⚠️ NAVER_CLIENT_ID or SECRET is not set. Using mock restaurant search.');
    let filtered = MOCK_RESTAURANTS.filter(r => 
      !query || r.name.includes(query) || r.category.includes(query) || r.menu.includes(query)
    );
    
    if (sort === 'distance') {
      filtered = filtered.sort((a, b) => {
        const distA = parseInt(a.distance.replace(/[^0-9]/g, '')) || 0;
        const distB = parseInt(b.distance.replace(/[^0-9]/g, '')) || 0;
        return distA - distB;
      });
    } else if (sort === 'comment') {
      filtered = filtered.sort((a, b) => b.rating - a.rating); // Fallback mock sort
    }

    return res.json({ success: true, items: filtered });
  }

  try {
    const maxDistanceMeters = 3000;
    const categories = ['한식', '일식', '중식', '양식', '카페'];
    const searchCategory = categories.find(c => query && query.includes(c));

    const response = await axios.get('https://openapi.naver.com/v1/search/local.json', {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret
      },
      params: {
        query: query || '맛집',
        display: 20,
        sort: sort === 'comment' ? 'comment' : 'random'
      }
    });

    const items = response.data.items || [];
    let formatted = items.map((item, idx) => {
      const cleanTitle = item.title.replace(/<[^>]*>/g, '');
      const category = item.category ? item.category.split('>').pop().trim() : '음식점';
      let distanceMeters = null;
      let distanceLabel = '';

      if (lat && lng && item.mapx && item.mapy) {
        try {
          const itemLng = parseInt(item.mapx) / 10000000;
          const itemLat = parseInt(item.mapy) / 10000000;
          distanceMeters = calculateHaversineDistance(parseFloat(lat), parseFloat(lng), itemLat, itemLng);
          if (!isNaN(distanceMeters)) {
            const mins = Math.max(1, Math.ceil(distanceMeters / 80));
            distanceLabel = `도보 ${mins}분 (${Math.round(distanceMeters)}m)`;
          }
        } catch (e) {
          console.warn("Coordinate conversion failed", e.message);
        }
      }

      if (!distanceLabel) {
        distanceLabel = calculateWalkDuration(item.address, item, lat, lng);
      }

      return {
        id: `naver-${idx}`,
        name: cleanTitle,
        category: category,
        rating: Number((4.0 + Math.random() * 1.0).toFixed(1)),
        distance: distanceLabel,
        distanceMeters: distanceMeters,
        menu: `${category} 대표 요리`,
        emoji: getEmojiByCategory(category),
        address: item.address || ''
      };
    });

    if (lat && lng) {
      formatted = formatted.filter(r => r.distanceMeters === null || r.distanceMeters <= maxDistanceMeters);
    }

    formatted.sort((a, b) => {
      const distA = a.distanceMeters ?? 99999;
      const distB = b.distanceMeters ?? 99999;
      return distA - distB;
    });

    formatted = formatted.slice(0, 15);

    res.json({ success: true, items: formatted });
  } catch (error) {
    console.error('Error calling Naver Search API:', error.message);
    const filtered = MOCK_RESTAURANTS.filter(r =>
      !query || r.name.includes(query) || r.category.includes(query) || r.menu.includes(query)
    );
    res.json({ success: true, items: filtered });
  }
});

// 5. Gemini AI Recommendation API
app.post('/api/restaurants/recommend', async (req, res) => {
  const { foodCategory, selectedTime, members } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('⚠️ GEMINI_API_KEY is not set. Using mock recommendation.');
    return res.json({
      success: true,
      recommendation: `참여자 중 컴퓨터공학과 학생이 있고 ${selectedTime} 시간대이므로, 두뇌 회전을 위해 당분과 단백질이 풍부한 ${foodCategory} 요리를 강력하게 추천합니다! 특별히 캠퍼스 명물 초밥 세트나 돼지불백 정식이 좋은 선택이 될 것입니다.`,
      recommendedMenu: `${foodCategory} 스페셜 세트`
    });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
      대학생들이 밥약을 잡으려고 합니다.
      - 약속 종류 / 음식 카테고리: ${foodCategory}
      - 확정된 시간대: ${selectedTime}
      - 참여자 정보: ${JSON.stringify(members)}

      이 조건에 맞춰 다음 형식의 JSON 객체로만 응답해 주세요. 다른 앞뒤 설명이나 코드블록 마크업(\`\`\`json) 없이 오직 순수한 JSON 문자열로만 응답해야 합니다:
      {
        "recommendation": "전공 학생들의 특성과 시간대를 재치 있게 엮어 이 카테고리를 추천하는 재미있는 한 줄 문구",
        "recommendedMenu": "구체적인 추천 메뉴 명칭"
      }
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(cleanText);

    res.json({
      success: true,
      recommendation: data.recommendation,
      recommendedMenu: data.recommendedMenu
    });
  } catch (error) {
    console.error('Error with Gemini API:', error.message);
    res.json({
      success: true,
      recommendation: `참여자 중 컴퓨터공학과 학생이 있고 ${selectedTime} 시간대이므로, 두뇌 회전을 위해 당분과 단백질이 풍부한 ${foodCategory} 요리를 강력하게 추천합니다! 특별히 캠퍼스 명물 초밥 세트나 돼지불백 정식이 좋은 선택이 될 것입니다.`,
      recommendedMenu: `${foodCategory} 스페셜 세트`
    });
  }
});

// ==========================================
// Multi-user Room Management APIs
// ==========================================
const IN_MEMORY_ROOMS = {};

// 6. Create Room
app.post('/api/rooms', async (req, res) => {
  const { title, foodCategory, hostName, hostMajor, schedule } = req.body;
  const roomId = Math.random().toString(36).substring(2, 9);
  
  const roomData = {
    id: roomId,
    title,
    foodCategory,
    status: 'matching',
    confirmedTime: '',
    confirmedRestaurant: null,
    members: [
      { name: hostName, major: hostMajor, role: 'host', schedule }
    ]
  };

  IN_MEMORY_ROOMS[roomId] = roomData;

  if (mongoose.connection.readyState === 1) {
    try {
      let userObj = await User.findOne({ name: hostName });
      if (!userObj) {
        userObj = new User({
          email: `${roomId}_host@babjjak.ac.kr`,
          name: hostName,
          major: hostMajor,
          isVerified: true
        });
        await userObj.save();
      }

      const roomObj = new Room({
        roomId,
        title,
        foodCategory,
        host: userObj._id,
        members: [{ user: userObj._id, role: 'host' }]
      });
      await roomObj.save();

      const scheduleObj = new Schedule({
        user: userObj._id,
        room: roomObj._id,
        freeSlots: Object.keys(schedule).filter(k => schedule[k])
      });
      await scheduleObj.save();

      console.log(`💾 Saved room ${roomId} to MongoDB.`);
    } catch (err) {
      console.warn('⚠️ MongoDB save failed, falling back to memory-only storage.', err.message);
    }
  }

  res.json({ success: true, roomId, room: roomData });
});

// Load a room from memory, falling back to MongoDB (e.g. after a server restart)
async function loadRoom(id) {
  let room = IN_MEMORY_ROOMS[id];

  if (!room && mongoose.connection.readyState === 1) {
    try {
      const roomObj = await Room.findOne({ roomId: id }).populate('host').populate('members.user');
      if (roomObj) {
        const membersList = [];
        for (const m of roomObj.members) {
          const userObj = m.user;
          if (!userObj) continue;
          const schedObj = await Schedule.findOne({ user: userObj._id, room: roomObj._id });
          const scheduleMap = {};
          if (schedObj && schedObj.freeSlots) {
            schedObj.freeSlots.forEach(s => {
              scheduleMap[s] = true;
            });
          }
          membersList.push({
            name: userObj.name,
            major: userObj.major || '',
            role: m.role,
            schedule: scheduleMap
          });
        }

        room = {
          id: id,
          title: roomObj.title,
          foodCategory: roomObj.foodCategory,
          status: roomObj.status,
          confirmedTime: roomObj.confirmedTime || '',
          confirmedRestaurant: roomObj.confirmedRestaurant || null,
          members: membersList
        };
        IN_MEMORY_ROOMS[id] = room;
      }
    } catch (err) {
      console.warn('⚠️ MongoDB lookup failed:', err.message);
    }
  }

  return room;
}

// 7. Get Room Details
app.get('/api/rooms/:id', async (req, res) => {
  const { id } = req.params;
  const room = await loadRoom(id);

  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found' });
  }

  res.json({ success: true, room });
});

// 8. Join Room
app.post('/api/rooms/:id/join', async (req, res) => {
  const { id } = req.params;
  const { name, major, schedule } = req.body;

  const room = await loadRoom(id);
  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found' });
  }

  const existingIdx = room.members.findIndex(m => m.name === name);
  if (existingIdx > -1) {
    room.members[existingIdx].schedule = schedule;
  } else {
    room.members.push({ name, major, role: 'participant', schedule });
  }

  if (mongoose.connection.readyState === 1) {
    try {
      let userObj = await User.findOne({ name });
      if (!userObj) {
        userObj = new User({
          email: `${id}_${Date.now()}@babjjak.ac.kr`,
          name,
          major,
          isVerified: true
        });
        await userObj.save();
      }

      const roomObj = await Room.findOneAndUpdate(
        { roomId: id },
        { $addToSet: { members: { user: userObj._id, role: 'participant' } } },
        { new: true }
      );

      if (roomObj) {
        await Schedule.findOneAndUpdate(
          { user: userObj._id, room: roomObj._id },
          {
            freeSlots: Object.keys(schedule).filter(k => schedule[k]),
            updatedAt: Date.now()
          },
          { upsert: true }
        );
      }

      console.log(`💾 Saved participant ${name} to MongoDB.`);
    } catch (err) {
      console.warn('⚠️ MongoDB join failed, updated memory-only.', err.message);
    }
  }

  res.json({ success: true, room });
});

// 9. Confirm Room
app.post('/api/rooms/:id/confirm', async (req, res) => {
  const { id } = req.params;
  const { time, restaurant } = req.body;

  const room = await loadRoom(id);
  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found' });
  }

  room.status = 'confirmed';
  room.confirmedTime = time;
  room.confirmedRestaurant = restaurant;

  if (mongoose.connection.readyState === 1) {
    try {
      await Room.findOneAndUpdate({ roomId: id }, {
        status: 'confirmed',
        confirmedTime: time,
        confirmedRestaurant: restaurant
      });
      console.log(`💾 Saved confirmation for room ${id} to MongoDB.`);
    } catch (err) {
      console.warn('⚠️ MongoDB confirm failed, updated memory-only.', err.message);
    }
  }

  res.json({ success: true, room });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
