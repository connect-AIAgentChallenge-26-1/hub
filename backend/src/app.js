const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const Tesseract = require('tesseract.js');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Storage configuration for Multer (Uploaded files)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Save to an uploads folder inside backend
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend service is healthy' });
});

// Credits OCR image upload API placeholder
app.post('/api/credits/analyze-image', upload.single('transcript'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`[OCR] File received: ${req.file.filename}`);
    
    // Simulate OCR delay and response
    // Week 2 will integrate actual Tesseract.js processing here.
    setTimeout(() => {
      res.json({
        success: true,
        message: '성적표 분석 완료',
        filename: req.file.filename,
        data: {
          extractedCredits: {
            majorReq: 6, // 6 credits major required
            majorOpt: 0,
            convergeEdu: 3, // 3 credits convergence (fills the missing domain!)
          },
          details: [
            { course: '자료구조', credit: 3, type: '전공필수' },
            { course: '데이터베이스', credit: 3, type: '전공필수' },
            { course: '기술과 현대사회', credit: 3, type: '융합교양(3영역)' }
          ]
        }
      });
    }, 1500);

  } catch (error) {
    console.error('OCR Error:', error);
    res.status(500).json({ error: 'Internal server error during analysis' });
  }
});

// AI Transcript detailed grade analysis API (Real OCR Integration)
app.post('/api/credits/analyze-transcript', upload.single('transcript'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const studentType = req.body.studentType || 'transfer';
    const imagePath = req.file.path;
    console.log(`[OCR Transcript] File received: ${req.file.filename} for studentType: ${studentType}. Starting OCR...`);

    // Run Tesseract OCR Text Recognition (Language: Korean + English)
    const { data: { text } } = await Tesseract.recognize(imagePath, 'kor+eng');
    console.log(`[OCR Transcript] OCR Text Recognition Complete. Extracted character count: ${text.length}`);

    // Parse lines and extract grades using dynamic GNU portal pattern
    const lines = text.split('\n');
    const extractedGrades = [];
    
    // Regex: Match course code (starts with 110 or 1102) and class code
    // Example: "전공선택 11002162 001 프로그래밍연습"
    const courseLineRegex = /(?:[A-Za-z가-힣\s\(\)]+)?\s*(11\d{6})\s*(\d{3})\s*(.*)/;
    const gradeRegex = /\b([A-D][0\+]|F|P)\b/i;
    
    let currentCourse = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const match = line.match(courseLineRegex);
      if (match) {
        if (currentCourse) {
          extractedGrades.push(currentCourse);
        }

        const courseCode = match[1];
        const classCode = match[2];
        let courseName = match[3].trim();

        // Clean up OCR noise in course name
        courseName = courseName.replace(/^_\s*/, ''); // remove leading underscore
        courseName = courseName.replace(/^[^\w가-힣]+/, ''); // remove leading special chars
        courseName = courseName.replace(/\|/g, ''); // remove | character (e.g. 비|즈니스 -> 비즈니스)
        courseName = courseName.replace(/\s*[A-Za-z]$/, ''); // remove trailing English letters (e.g. 양)
        courseName = courseName.trim();

        // Map OCR errors for 꿈·미래개척
        if (courseName.includes('&=-O|2{7HA') || courseName.includes('꿈') || courseName.includes('미래개척') || courseCode === '11023216') {
          courseName = '꿈·미래개척';
        }

        // Determine category
        let type = '전공선택';
        if (line.includes('일반선택') || line.includes('일반석') || line.includes('일반')) {
          type = '일반선택';
        } else if (line.includes('교양') || courseName === '대학영어') {
          type = '교양';
        } else if (line.includes('전공필수') || line.includes('전필')) {
          type = '전공필수';
        }

        currentCourse = {
          course: courseName,
          grade: 'A+', // default
          credit: 3, // default
          type: type,
          linesSearch: []
        };
      } else if (currentCourse) {
        currentCourse.linesSearch.push(line);
      }
    }

    if (currentCourse) {
      extractedGrades.push(currentCourse);
    }

    // Process collected lines for grades and credits
    let finalGrades = extractedGrades.map(c => {
      let grade = 'A+';
      let credit = 3;

      for (let searchLine of c.linesSearch) {
        const gradeMatch = searchLine.match(gradeRegex);
        if (gradeMatch) {
          grade = gradeMatch[1].toUpperCase();
        } else {
          const upperLine = searchLine.replace(/\s+/g, '').toUpperCase();
          const grades = ['A+', 'A0', 'B+', 'B0', 'C+', 'C0', 'D+', 'D0', 'F', 'P'];
          for (let g of grades) {
            if (upperLine === g || upperLine.includes(g)) {
              grade = g;
              break;
            }
          }
        }

        const creditMatch = searchLine.match(/\b(0\.5|[1-3])\b/);
        if (creditMatch) {
          credit = parseFloat(creditMatch[1]);
        }
      }

      return {
        course: c.course,
        grade: grade,
        credit: credit,
        type: c.type
      };
    });

    // Try to extract overall GPA from text (e.g., "평점평균(전체) 4.33")
    let overallGpaText = null;
    const gpaMatch = text.match(/평점평균\s*\(?\s*전체\s*\)?\s*(\d\.\d{2})/i) || text.match(/평점평균\s*(\d\.\d{2})/i);
    if (gpaMatch) {
      overallGpaText = gpaMatch[1];
      console.log(`[OCR Transcript] Extracted overall GPA from image text: ${overallGpaText}`);
    }

    // Fallback to simulated database profile if no grades were recognized (random image uploaded)
    let isFallback = false;
    if (finalGrades.length === 0) {
      isFallback = true;
      console.log('[OCR Transcript] No courses recognized. Using fallback profile for studentType:', studentType);
      if (studentType === 'transfer') {
        finalGrades.push(
          { course: '자료구조 및 실습', grade: 'C+', credit: 3, type: '전공필수' },
          { course: '데이터베이스 시스템', grade: 'A0', credit: 3, type: '전공필수' },
          { course: '컴퓨터네트워크', grade: 'A+', credit: 3, type: '전공선택' },
          { course: '소프트웨어공학', grade: 'B+', credit: 3, type: '전공선택' },
          { course: '이산수학', grade: 'A+', credit: 3, type: '전공선택' }
        );
      } else if (studentType === 'general') {
        finalGrades.push(
          { course: '자료구조 및 실습', grade: 'B0', credit: 3, type: '전공필수' },
          { course: '데이터베이스 시스템', grade: 'B+', credit: 3, type: '전공필수' },
          { course: '컴퓨터네트워크', grade: 'A0', credit: 3, type: '전공선택' },
          { course: '소프트웨어공학', grade: 'C+', credit: 3, type: '전공선택' }
        );
      } else {
        finalGrades.push(
          { course: '자료구조 및 실습', grade: 'B0', credit: 3, type: '전공필수' },
          { course: '데이터베이스 시스템', grade: 'C+', credit: 3, type: '전공필수' },
          { course: '컴퓨터네트워크', grade: 'C0', credit: 3, type: '전공선택' }
        );
      }
    }

    // Calculate GPA dynamically
    const gradePoints = {
      'A+': 4.5, 'A0': 4.0,
      'B+': 3.5, 'B0': 3.0,
      'C+': 2.5, 'C0': 2.0,
      'D+': 1.5, 'D0': 1.0,
      'F': 0.0
    };

    let totalPoints = 0;
    let totalCredits = 0;
    finalGrades.forEach(g => {
      if (g.grade === 'P') return; // Exclude Pass courses from GPA calculation
      const pt = gradePoints[g.grade] !== undefined ? gradePoints[g.grade] : 4.0;
      totalPoints += pt * g.credit;
      totalCredits += g.credit;
    });

    const calculatedGpa = totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : '3.00';
    const overallGpa = overallGpaText || calculatedGpa;

    // Identify target low grade course (C+ or below)
    const lowGrades = ['C+', 'C0', 'D+', 'D0', 'F'];
    const targetCourseObj = finalGrades.find(g => lowGrades.includes(g.grade)) || finalGrades[0];
    const targetCourseName = targetCourseObj ? targetCourseObj.course : '자료구조 및 실습';
    const targetCourseGrade = targetCourseObj ? targetCourseObj.grade : 'C+';

    // Generate dynamic AI Advisory
    let advisory = {};
    const hasLowGrade = finalGrades.some(g => lowGrades.includes(g.grade));
    const studentName = studentType === 'transfer' ? '김경상' : studentType === 'general' ? '박경상' : '이경상';

    if (hasLowGrade) {
      const gpaNum = parseFloat(overallGpa);
      if (gpaNum >= 3.7) {
        advisory = {
          gpaStatus: 'high',
          recommendRetake: false,
          targetCourse: targetCourseName,
          title: '재수강 비권장 (타 전공심화 이수 추천)',
          message: `${studentName}님은 ${targetCourseName} 과목에서 ${targetCourseGrade}를 취득하셨으나, 전체 누적 평점이 ${overallGpa}로 매우 우수한 상태입니다. 기업 선발이나 상위 과정 진학 시 개별 과목의 ${targetCourseGrade} 학점 하나보다는 전체 누적 평점의 완성도가 훨씬 높게 평가됩니다. 따라서 재수강 시간 대비 효율을 감안해 고급 전공 선택 과목을 이수하여 지식을 확장하시는 것을 권장합니다.`
        };
      } else if (gpaNum >= 3.2) {
        advisory = {
          gpaStatus: 'medium',
          recommendRetake: true,
          targetCourse: targetCourseName,
          title: '재수강 선택적 권장 (평점 3.5 진입 전략)',
          message: `${studentName}님은 현재 전체 평점이 ${overallGpa}인 상태로, 상위 우수 취업 기준선인 3.5 진입이 목표입니다. 평점을 끌어내린 ${targetCourseName}(${targetCourseGrade}) 과목을 재수강하여 A등급 이상으로 취득할 경우 전체 GPA 상승에 매우 효과적입니다. 다만, 전공선택 부담이 클 경우 시기를 다음 학기로 조율하는 방법도 있습니다.`
        };
      } else {
        advisory = {
          gpaStatus: 'low',
          recommendRetake: true,
          targetCourse: targetCourseName,
          title: '재수강 강력 권장 (전공 평점 긴급 복구)',
          message: `${studentName}님은 전체 평점이 ${overallGpa}로 졸업 평점 안정선에 미치지 못합니다. 특히 전공 핵심이자 낮은 학점을 가진 ${targetCourseName}(${targetCourseGrade})의 평점 보완이 시급합니다. 재수강 시 기존 등급이 완전히 소멸되어 전체 GPA 세탁 효과가 가장 높은 과목이므로, 이번 학기 최우선적으로 수강신청에 반영하여 성적을 만회하시기 바랍니다.`
        };
      }
    } else {
      advisory = {
        gpaStatus: 'high',
        recommendRetake: false,
        targetCourse: targetCourseName,
        title: '모든 과목 성적 양호 (재수강 불필요)',
        message: `축하합니다! 판독된 성적표 내역 중 C+ 이하의 저조한 과목이 발견되지 않았습니다. 전체 평점 평균이 ${overallGpa}로 훌륭하고 안정적이므로 재수강 없이 본래 계획대로 신규 전공 설계 및 남은 졸업 학점 취득을 이어가시기 바랍니다.`
      };
    }

    // Save to in-memory persistence store
    inMemorySavedGrades = {
      studentName: studentName,
      overallGpa: overallGpa,
      extractedGrades: finalGrades,
      advisory: advisory
    };

    res.json({
      success: true,
      message: isFallback ? '성적표 스캔 완료 (모의 데이터 대체)' : '성적표 상세 분석 및 AI 진단 완료',
      data: inMemorySavedGrades
    });

  } catch (error) {
    console.error('OCR Transcript Error:', error);
    res.status(500).json({ error: 'Internal server error during transcript analysis' });
  }
});

// ==========================================
// PERSISTENCE APIs (Supabase DB + In-Memory Fallback)
// ==========================================

const supabase = require('./supabase');

// In-memory persistence stores
let inMemoryChatMessages = [
  { role: 'assistant', content: '안녕하세요! 경상국립대학교 AI 학업 어드바이저입니다. 수강신청, 시간표 작성, 학점 관리 또는 재수강에 대해 궁금한 점을 언제든 물어보세요!' }
];
let inMemorySavedGrades = null;

const fs = require('fs');

const USERS_FILE_PATH = path.join(__dirname, '../users.json');

// Helper to load users from JSON file
const loadUsers = () => {
  try {
    if (fs.existsSync(USERS_FILE_PATH)) {
      const data = fs.readFileSync(USERS_FILE_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error loading users file, using defaults.', e);
  }
  return [
    { studentId: '2021000001', name: '김경상', password: 'password123', studentType: 'transfer', department: '컴퓨터공학과', email: '2021000001@gnu.ac.kr' },
    { studentId: '2021000002', name: '박경상', password: 'password123', studentType: 'general', department: '경영정보학과', email: '2021000002@gnu.ac.kr' },
    { studentId: '2021000003', name: '이경상', password: 'password123', studentType: 'double-major', department: '통계학과', email: '2021098765@gnu.ac.kr' }
  ];
};

// Helper to save users to JSON file
const saveUsers = (users) => {
  try {
    fs.writeFileSync(USERS_FILE_PATH, JSON.stringify(users, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving users file.', e);
  }
};

// Load users database
let inMemoryUsers = loadUsers();

// POST /api/auth/signup - Register user
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { studentId, name, password, studentType, department, email } = req.body;
    if (!studentId || !password) {
      return res.status(400).json({ error: '학번과 비밀번호는 필수 입력 항목입니다.' });
    }

    const exists = inMemoryUsers.some(u => u.studentId === studentId);
    if (exists) {
      return res.status(400).json({ error: '이미 존재하는 학번입니다.' });
    }

    const newUser = {
      studentId,
      name: name || '학생',
      password,
      studentType: studentType || 'general',
      department: department || '컴퓨터공학과',
      email: email || `${studentId}@gnu.ac.kr`
    };

    inMemoryUsers.push(newUser);
    saveUsers(inMemoryUsers);

    // Save to Supabase public.profiles if connected
    if (supabase) {
      try {
        await supabase.from('profiles').insert([
          { name: newUser.name, student_type: newUser.studentType, department: newUser.department }
        ]).catch(() => {});
      } catch (e) {}
    }

    res.status(201).json({ success: true, message: '회원가입이 완료되었습니다.', user: newUser });
  } catch (error) {
    console.error('Signup Error:', error);
    res.status(500).json({ error: 'Internal server error during signup' });
  }
});

// POST /api/auth/login - Authenticate user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { studentId, password } = req.body;
    if (!studentId || !password) {
      return res.status(400).json({ error: '학번과 비밀번호를 입력해주세요.' });
    }

    const user = inMemoryUsers.find(u => u.studentId === studentId);
    if (!user) {
      return res.status(404).json({ error: '존재하지 않는 학번입니다.' });
    }

    if (user.password !== password) {
      return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });
    }

    res.json({ success: true, message: '로그인에 성공했습니다.', user });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// POST /api/chat - Save user question & AI response to Supabase chat_messages
app.post('/api/chat', async (req, res) => {
  try {
    const { userMessage, aiResponse, userId } = req.body;
    if (!userMessage || !userMessage.trim()) {
      return res.status(400).json({ error: 'User message is required' });
    }

    if (supabase) {
      const { error } = await supabase.from('chat_messages').insert([
        { role: 'user', content: userMessage.trim(), user_id: userId || null },
        { role: 'assistant', content: aiResponse || '답변을 생성할 수 없습니다.', user_id: userId || null }
      ]);
      if (error) console.error('[Supabase Chat Insert Error]:', error.message);
    }

    inMemoryChatMessages.push({ role: 'user', content: userMessage.trim() });
    if (aiResponse) {
      inMemoryChatMessages.push({ role: 'assistant', content: aiResponse });
    }

    res.json({ success: true, message: '대화 내역이 성공적으로 저장되었습니다.' });
  } catch (error) {
    console.error('Chat Save Error:', error);
    res.status(500).json({ error: 'Failed to save chat message' });
  }
});

// GET /api/chat - Fetch chat history for user
app.get('/api/chat', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: true });
      if (!error && data && data.length > 0) {
        return res.json({ success: true, messages: data });
      }
    }
    res.json({ success: true, messages: inMemoryChatMessages });
  } catch (error) {
    res.json({ success: true, messages: inMemoryChatMessages });
  }
});

// POST /api/credits/save-grades - Store parsed OCR grades
app.post('/api/credits/save-grades', async (req, res) => {
  try {
    const { overallGpa, extractedGrades, advisory, studentName } = req.body;
    if (!extractedGrades || !Array.isArray(extractedGrades)) {
      return res.status(400).json({ error: 'Invalid grades payload' });
    }

    inMemorySavedGrades = { overallGpa, extractedGrades, advisory, studentName };

    if (supabase) {
      const rows = extractedGrades.map(g => ({
        subject_name: g.course,
        credit: g.credit,
        grade_point: g.grade,
        semester: '2026-1'
      }));
      const { error } = await supabase.from('user_grades').insert(rows);
      if (error) console.error('[Supabase Grades Insert Error]:', error.message);
    }

    res.json({ success: true, message: '성적 및 AI 진단 정보가 DB에 영구 저장되었습니다.' });
  } catch (error) {
    console.error('Save Grades Error:', error);
    res.status(500).json({ error: 'Failed to save grades' });
  }
});

// GET /api/credits/saved-grades - Retrieve saved grades for persistence across refresh
app.get('/api/credits/saved-grades', async (req, res) => {
  try {
    if (inMemorySavedGrades) {
      return res.json({ success: true, data: inMemorySavedGrades });
    }
    res.json({ success: false, data: null });
  } catch (error) {
    res.json({ success: false, data: null });
  }
});

module.exports = app;
