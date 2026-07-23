import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, LineChart, Award, BookOpen, GraduationCap, CheckCircle, HelpCircle, TrendingUp,
  UploadCloud, Loader2, Sparkles, RefreshCw, FileText, CheckCircle2, AlertTriangle, X 
} from 'lucide-react';
import axios from 'axios';

// Mock Grade Data per student profile
const STUDENT_GRADES_DATABASE = {
  '2025080081': {
    name: '김민성',
    summary: {
      totalCredits: 124.5,
      totalGoal: 130,
      majorCredits: 75,
      majorGoal: 69, // 23학번~ 단일 전공 소계 69학점 (필수 21 + 선택 48)
      generalCredits: 49.5,
      generalGoal: 40, // 편입생 교양 총합 40학점 기준
      gpa: '4.08',
    },
    trend: [
      { semester: '1-1 (전적대)', gpa: 4.16, credits: 18, majorGpa: 4.50 },
      { semester: '1-2 (전적대)', gpa: 4.24, credits: 21, majorGpa: 4.00 },
      { semester: '2-1 (전적대)', gpa: 4.41, credits: 16.25, majorGpa: 4.38 },
      { semester: '2-2 (전적대)', gpa: 4.29, credits: 14.25, majorGpa: 4.25 },
      { semester: '3-1 (GNU)', gpa: 3.75, credits: 18.5, majorGpa: 3.75 },
      { semester: '3-2 (GNU)', gpa: 4.17, credits: 20.5, majorGpa: 4.17 },
      { semester: '4-1 (GNU)', gpa: 4.33, credits: 18.5, majorGpa: 4.50 }
    ],
    semesters: [
      { id: '1-1', title: '1학년 1학기 (전적대)', gpa: '4.16', majorGpa: '4.50', earned: 18, majorEarned: 3, remark: '전적대학 학점인정' },
      { id: '1-2', title: '1학년 2학기 (전적대)', gpa: '4.24', majorGpa: '4.00', earned: 21, majorEarned: 9, remark: '전적대학 학점인정' },
      { id: '2-1', title: '2학년 1학기 (전적대)', gpa: '4.41', majorGpa: '4.38', earned: 16.25, majorEarned: 9, remark: '전적대학 학점인정' },
      { id: '2-2', title: '2학년 2학기 (전적대)', gpa: '4.29', majorGpa: '4.25', earned: 14.25, majorEarned: 9, remark: '전적대학 학점인정' },
      { id: '3-1', title: '3학년 1학기 (GNU)', gpa: '3.75', majorGpa: '3.75', earned: 18.5, majorEarned: 18, remark: '편입 후 첫 학기' },
      { id: '3-2', title: '3학년 2학기 (GNU)', gpa: '4.17', majorGpa: '4.17', earned: 20.5, majorEarned: 18, remark: '학적 평점 4.17' },
      { id: '4-1', title: '4학년 1학기 (GNU)', gpa: '4.33', majorGpa: '4.50', earned: 18.5, majorEarned: 15, remark: '학적 평점 4.33' }
    ]
  },
  'transfer': {
    name: '김경상',
    summary: {
      totalCredits: 84,
      totalGoal: 130,
      majorCredits: 42,
      majorGoal: 60,
      generalCredits: 42,
      generalGoal: 70,
      gpa: '3.90',
    },
    trend: [
      { semester: '1-1 (전적대)', gpa: 3.40, credits: 18, majorGpa: 3.20 },
      { semester: '1-2 (전적대)', gpa: 3.55, credits: 18, majorGpa: 3.40 },
      { semester: '2-1 (전적대)', gpa: 3.65, credits: 18, majorGpa: 3.50 },
      { semester: '2-2 (전적대)', gpa: 3.72, credits: 18, majorGpa: 3.60 },
      { semester: '3-1 (GNU)', gpa: 3.90, credits: 12, majorGpa: 4.00 }
    ],
    semesters: [
      { id: '1-1', title: '1학년 1학기 (전적대 인정)', gpa: '3.40', majorGpa: '3.20', earned: 18, majorEarned: 6, remark: '편입학 학점인정' },
      { id: '1-2', title: '1학년 2학기 (전적대 인정)', gpa: '3.55', majorGpa: '3.40', earned: 18, majorEarned: 9, remark: '편입학 학점인정' },
      { id: '2-1', title: '2학년 1학기 (전적대 인정)', gpa: '3.65', majorGpa: '3.50', earned: 18, majorEarned: 12, remark: '편입학 학점인정' },
      { id: '2-2', title: '2학년 2학기 (전적대 인정)', gpa: '3.72', majorGpa: '3.60', earned: 18, majorEarned: 9, remark: '편입학 학점인정' },
      { id: '3-1', title: '3학년 1학기 (GNU)', gpa: '3.90', majorGpa: '4.00', earned: 12, majorEarned: 6, remark: '성적 우수 백학장학' }
    ]
  },
  'general': {
    name: '박경상',
    summary: {
      totalCredits: 96,
      totalGoal: 130,
      majorCredits: 42,
      majorGoal: 60,
      generalCredits: 54,
      generalGoal: 70,
      gpa: '3.75',
    },
    trend: [
      { semester: '1-1', gpa: 3.25, credits: 18, majorGpa: 3.00 },
      { semester: '1-2', gpa: 3.42, credits: 19, majorGpa: 3.30 },
      { semester: '2-1', gpa: 3.65, credits: 21, majorGpa: 3.70 },
      { semester: '2-2', gpa: 3.78, credits: 20, majorGpa: 3.80 },
      { semester: '3-1', gpa: 3.92, credits: 18, majorGpa: 4.10 }
    ],
    semesters: [
      { id: '1-1', title: '1학년 1학기', gpa: '3.25', majorGpa: '3.00', earned: 18, majorEarned: 6, remark: '-' },
      { id: '1-2', title: '1학년 2학기', gpa: '3.42', majorGpa: '3.30', earned: 19, majorEarned: 6, remark: '-' },
      { id: '2-1', title: '2학년 1학기', gpa: '3.65', majorGpa: '3.70', earned: 21, majorEarned: 12, remark: '성적 우수 격려금' },
      { id: '2-2', title: '2학년 2학기', gpa: '3.78', majorGpa: '3.80', earned: 20, majorEarned: 12, remark: '성적 우수 동선장학' },
      { id: '3-1', title: '3학년 1학기', gpa: '3.92', majorGpa: '4.10', earned: 18, majorEarned: 6, remark: '학과 수석 개척장학' }
    ]
  },
  'double-major': {
    name: '이경상',
    summary: {
      totalCredits: 78,
      totalGoal: 150,
      majorCredits: 33,
      majorGoal: 60,
      generalCredits: 45,
      generalGoal: 90,
      gpa: '3.64',
    },
    trend: [
      { semester: '1-1', gpa: 3.50, credits: 17, majorGpa: 3.30 },
      { semester: '1-2', gpa: 3.65, credits: 18, majorGpa: 3.50 },
      { semester: '2-1', gpa: 3.48, credits: 19, majorGpa: 3.20 },
      { semester: '2-2', gpa: 3.72, credits: 18, majorGpa: 3.65 },
      { semester: '3-1', gpa: 3.85, credits: 16, majorGpa: 3.80 }
    ],
    semesters: [
      { id: '1-1', title: '1학년 1학기', gpa: '3.50', majorGpa: '3.30', earned: 17, majorEarned: 6, remark: '-' },
      { id: '1-2', title: '1학년 2학기', gpa: '3.65', majorGpa: '3.50', earned: 18, majorEarned: 6, remark: '-' },
      { id: '2-1', title: '2학년 1학기', gpa: '3.48', majorGpa: '3.20', earned: 19, majorEarned: 9, remark: '복수전공(경영) 승인' },
      { id: '2-2', title: '2학년 2학기', gpa: '3.72', majorGpa: '3.65', earned: 18, majorEarned: 12, remark: '성적 우수 동선장학' },
      { id: '3-1', title: '3학년 1학기', gpa: '3.85', majorGpa: '3.80', earned: 16, majorEarned: 9, remark: '경영학과 학술 우수상' }
    ]
  }
};

function CreditAnalytics({ user, initialStudentType }) {
  const navigate = useNavigate();
  const [studentType, setStudentType] = useState(initialStudentType || 'transfer');
  
  const studentData = user && user.studentId === '2025080081' ? STUDENT_GRADES_DATABASE['2025080081'] : STUDENT_GRADES_DATABASE[studentType];
  const realName = user ? user.name : studentData.name;

  const getDynamicText = (text) => {
    if (!text) return '';
    return text
      .replace(/김경상/g, realName)
      .replace(/박경상/g, realName)
      .replace(/이경상/g, realName);
  };

  const [hoveredPoint, setHoveredPoint] = useState(null);

  // States for transcript upload & AI consulting
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [analysisResult, setAnalysisResult] = useState(null);
  const fileInputRef = useRef(null);

  // Restore saved grades on mount for persistence across refresh
  useEffect(() => {
    // 1. Try fetching from server API
    axios.get('http://localhost:5000/api/credits/saved-grades')
      .then(res => {
        if (res.data && res.data.success && res.data.data) {
          setAnalysisResult(res.data.data);
        } else {
          // 2. Fallback to localStorage
          const cached = localStorage.getItem('gnu_saved_analysis_result');
          if (cached) setAnalysisResult(JSON.parse(cached));
        }
      })
      .catch(() => {
        const cached = localStorage.getItem('gnu_saved_analysis_result');
        if (cached) {
          try { setAnalysisResult(JSON.parse(cached)); } catch (e) {}
        }
      });
  }, []);

  // Save result whenever analysisResult changes
  useEffect(() => {
    if (analysisResult) {
      try {
        localStorage.setItem('gnu_saved_analysis_result', JSON.stringify(analysisResult));
        axios.post('http://localhost:5000/api/credits/save-grades', analysisResult).catch(() => {});
      } catch (e) {}
    }
  }, [analysisResult]);

  const runClientSideSimulation = () => {
    let mockData = {};
    if (studentType === 'transfer') {
      mockData = {
        studentName: realName,
        overallGpa: '3.90',
        extractedGrades: [
          { course: '자료구조 및 실습', grade: 'C+', credit: 3, type: '전공필수' },
          { course: '데이터베이스 시스템', grade: 'A0', credit: 3, type: '전공필수' },
          { course: '컴퓨터네트워크', grade: 'A+', credit: 3, type: '전공선택' },
          { course: '소프트웨어공학', grade: 'B+', credit: 3, type: '전공선택' },
          { course: '이산수학', grade: 'A+', credit: 3, type: '전공선택' }
        ],
        advisory: {
          gpaStatus: 'high',
          recommendRetake: false,
          targetCourse: '자료구조 및 실습',
          title: '재수강 비권장 (타 전공심화 이수 추천)',
          message: `${realName}님은 자료구조 및 실습 과목에서 C+을 취득하셨으나, 전체 성적 평점이 3.90으로 매우 높은 우수 학생입니다. 취업 및 대학원 진학 시 개별 과목의 C+ 하나보다 전체 평점의 균형이 훨씬 긍정적으로 작용합니다. 따라서 재수강으로 인한 학점 중복보다는 다른 전공 선택 및 심화 과목을 수강하여 전공의 깊이를 더 넓히는 것을 적극 추천합니다.`
        }
      };
    } else if (studentType === 'general') {
      mockData = {
        studentName: realName,
        overallGpa: '3.20',
        extractedGrades: [
          { course: '자료구조 및 실습', grade: 'B0', credit: 3, type: '전공필수' },
          { course: '데이터베이스 시스템', grade: 'B+', credit: 3, type: '전공필수' },
          { course: '컴퓨터네트워크', grade: 'A0', credit: 3, type: '전공선택' },
          { course: '소프트웨어공학', grade: 'C+', credit: 3, type: '전공선택' }
        ],
        advisory: {
          gpaStatus: 'medium',
          recommendRetake: true,
          targetCourse: '소프트웨어공학',
          title: '재수강 선택적 권장 (평점 3.5 진입 전략)',
          message: `${realName}님은 현재 전체 평점이 3.20인 상태로, 3.5(상위 대학원 및 우수 취업 기준선) 진입을 목표로 설계가 필요합니다. 전공선택 과목인 소프트웨어공학(C+)을 재수강하여 A학점 이상으로 업그레이드할 경우 전체 GPA 상승에 큰 보탬이 됩니다. 단, 이번 학기 수강에 여유가 없을 경우 다음 학기로 미루어 재수강하시는 것도 좋은 대안입니다.`
        }
      };
    } else {
      mockData = {
        studentName: realName,
        overallGpa: '2.85',
        extractedGrades: [
          { course: '자료구조 및 실습', grade: 'B0', credit: 3, type: '전공필수' },
          { course: '데이터베이스 시스템', grade: 'C+', credit: 3, type: '전공필수' },
          { course: '컴퓨터네트워크', grade: 'C0', credit: 3, type: '전공선택' }
        ],
        advisory: {
          gpaStatus: 'low',
          recommendRetake: true,
          targetCourse: '데이터베이스 시스템',
          title: '재수강 강력 권장 (핵심 전필 평점 복구)',
          message: `${realName}님은 전체 평점이 2.85로 졸업 학점 하한선 경고 상태에 가깝습니다. 특히 다전공 및 주전공 복합 설계에 있어 핵심 전공필수인 데이터베이스 시스템(C+)의 평점 타격이 매우 큽니다. 본 과목은 재수강 시 기존 낮은 학점이 즉시 소멸되므로, 평점 복구를 위해 이번 학기에 반드시 재수강하여 학점을 A등급 이상으로 취득하시는 것을 강력히 권장합니다.`
        }
      };
    }
    setAnalysisResult(mockData);
  };

    const handleFileChange = async (e) => {
      const selectedFile = e.target.files[0];
      if (!selectedFile) return;

      setFile(selectedFile);
      setIsUploading(true);
      setAnalysisResult(null);

      // Simulate multi-stage OCR loading
      const stages = [
        '성적표 이미지 확인 및 OCR 스캔 초기화 중...',
        '교과목 텍스트 분석 및 취득 등급(Grade) 추출 중...',
        '평점 평균(GPA) 계산 및 핵심 교과목 연계성 대조 중...',
        'AI 알고리즘 분석 기반 재수강 가이드라인 생성 중...'
      ];

      let currentStageIdx = 0;
      setLoadingStage(stages[0]);
      const stageInterval = setInterval(() => {
        currentStageIdx++;
        if (currentStageIdx < stages.length) {
          setLoadingStage(stages[currentStageIdx]);
        }
      }, 1200);

      const formData = new FormData();
      formData.append('transcript', selectedFile);
      formData.append('studentType', studentType);

      try {
        const response = await axios.post('/api/credits/analyze-transcript', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
        
        clearInterval(stageInterval);
        
        // Delay slightly for smooth transition
        setTimeout(() => {
          if (response.data && response.data.success) {
            setAnalysisResult(response.data.data);
          } else {
            // Fallback to client-side simulation
            runClientSideSimulation();
          }
          setIsUploading(false);
        }, 800);

      } catch (error) {
        console.warn('Backend server offline. Falling back to client-side AI simulation.');
        clearInterval(stageInterval);
        
        // Fallback to client-side simulation
        setTimeout(() => {
          runClientSideSimulation();
          setIsUploading(false);
        }, 800);
      }
    };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const fileEvent = { target: { files: [droppedFile] } };
      handleFileChange(fileEvent);
    }
  };

  const resetAnalysis = () => {
    setFile(null);
    setAnalysisResult(null);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // SVG Chart Dimensions
  const chartWidth = 540;
  const chartHeight = 220;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 35;

  // X Coordinate calculation
  const getX = (index, total) => {
    const usableWidth = chartWidth - paddingLeft - paddingRight;
    return paddingLeft + (index / (total - 1)) * usableWidth;
  };

  // Y Coordinate calculation (mapping GPA 2.0 ~ 4.5)
  const minGpa = 2.0;
  const maxGpa = 4.5;
  const getY = (gpa) => {
    const usableHeight = chartHeight - paddingTop - paddingBottom;
    const gpaRatio = (gpa - minGpa) / (maxGpa - minGpa);
    // SVG coordinates start at top left (0,0), so subtract from height
    return chartHeight - paddingBottom - gpaRatio * usableHeight;
  };

  // Build SVG Path strings for trend line and area fill
  const buildSvgPaths = (points) => {
    if (!points || points.length === 0) return { linePath: '', areaPath: '' };
    
    let linePath = '';
    let areaPath = '';
    
    points.forEach((pt, idx) => {
      const cx = getX(idx, points.length);
      const cy = getY(pt.gpa);
      
      if (idx === 0) {
        linePath = `M ${cx} ${cy}`;
        areaPath = `M ${cx} ${chartHeight - paddingBottom} L ${cx} ${cy}`;
      } else {
        // Curve construction using helper control points (simplified Bezier)
        const prevCx = getX(idx - 1, points.length);
        const prevCy = getY(points[idx - 1].gpa);
        const cpX1 = prevCx + (cx - prevCx) / 2;
        const cpY1 = prevCy;
        const cpX2 = prevCx + (cx - prevCx) / 2;
        const cpY2 = cy;
        
        linePath += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${cx} ${cy}`;
        areaPath += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${cx} ${cy}`;
      }
      
      if (idx === points.length - 1) {
        areaPath += ` L ${cx} ${chartHeight - paddingBottom} Z`;
      }
    });

    return { linePath, areaPath };
  };

  const { linePath, areaPath } = buildSvgPaths(studentData.trend);

  // Grid line GPA markers
  const yTicks = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5];

  // Helper helper to format categories
  const getStudentTypeLabel = (type) => {
    switch (type) {
      case 'transfer': return '편입생';
      case 'general': return '일반재학생';
      case 'double-major': return '다전공자';
      default: return '학생';
    }
  };

  return (
    <div className="credit-analytics">
      {/* Top Navbar */}
      <header className="portal-header card-glass">
        <div className="portal-logo" onClick={() => navigate('/portal')}>
          <ArrowLeft size={18} className="logo-icon text-indigo" />
          <span className="logo-text">GNU AI PORTAL</span>
        </div>
        
        <div className="portal-user-menu">
          {!(user && user.studentId === '2025080081') && (
            <div className="profile-switcher-wrapper">
              <span className="switcher-label">시뮬레이션 학적: </span>
              <select 
                value={studentType} 
                onChange={(e) => setStudentType(e.target.value)}
                className="student-type-select"
              >
                <option value="transfer">편입생</option>
                <option value="general">재학생</option>
                <option value="double-major">다전공자</option>
              </select>
            </div>
          )}
          
          <button onClick={() => navigate('/portal')} className="btn-logout">
            <span>메인 포털</span>
          </button>
        </div>
      </header>

      {/* Main Analytics Content Container */}
      <main className="analytics-layout">
        {/* Page title */}
        <section className="analytics-header animate-fade-in-up">
          <h2>학점 분석 & 성적 추이 리포트</h2>
          <p>
            {realName}님의 학기별 이수 학점 세부 내역 및 평점 추이를 시각화하여 보여줍니다.
          </p>
        </section>

        {/* Summary Metric Cards Row */}
        <section className="summary-grid animate-fade-in-up">
          <div className="summary-card card-glass">
            <div className="card-top">
              <span>전체 이수 학점</span>
              <BookOpen className="card-icon text-indigo" size={18} />
            </div>
            <div className="card-bottom">
              <h3>{studentData.summary.totalCredits} <span className="goal">/ {studentData.summary.totalGoal}학점</span></h3>
              <div className="mini-progress-bar">
                <div className="mini-fill primary" style={{ width: `${(studentData.summary.totalCredits / studentData.summary.totalGoal) * 100}%` }}></div>
              </div>
            </div>
          </div>

          <div className="summary-card card-glass">
            <div className="card-top">
              <span>전공 이수 학점</span>
              <GraduationCap className="card-icon text-blue" size={18} />
            </div>
            <div className="card-bottom">
              <h3>{studentData.summary.majorCredits} <span className="goal">/ {studentData.summary.majorGoal}학점</span></h3>
              <div className="mini-progress-bar">
                <div className="mini-fill secondary" style={{ width: `${(studentData.summary.majorCredits / studentData.summary.majorGoal) * 100}%` }}></div>
              </div>
            </div>
          </div>

          <div className="summary-card card-glass">
            <div className="card-top">
              <span>교양 이수 학점</span>
              <Award className="card-icon text-success" size={18} />
            </div>
            <div className="card-bottom">
              <h3>{studentData.summary.generalCredits} <span className="goal">/ {studentData.summary.generalGoal}학점</span></h3>
              <div className="mini-progress-bar">
                <div className="mini-fill success" style={{ width: `${(studentData.summary.generalCredits / studentData.summary.generalGoal) * 100}%` }}></div>
              </div>
            </div>
          </div>

          <div className="summary-card card-glass">
            <div className="card-top">
              <span>누적 전체 평점 (GPA)</span>
              <TrendingUp className="card-icon text-warning" size={18} />
            </div>
            <div className="card-bottom font-outfit">
              <h3>{studentData.summary.gpa} <span className="goal">/ 4.50</span></h3>
              <span className="trend-up-label">상승 곡선 유지 중</span>
            </div>
          </div>
        </section>

        {/* Charts and Audits Column Section */}
        <section className="charts-section-grid">
          {/* Chart Card */}
          <div className="chart-card card-glass animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            <div className="chart-card-header">
              <h4>학기별 성적 추이 (GPA)</h4>
              <div className="chart-legend">
                <span className="legend-item"><span className="dot primary"></span>학기별 GPA</span>
              </div>
            </div>
            
            <div className="chart-body">
              {/* Interactive SVG Chart */}
              <div className="chart-svg-container" style={{ position: 'relative' }}>
                <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="line-grad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="var(--color-primary)" />
                      <stop offset="100%" stopColor="var(--color-secondary)" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid lines */}
                  {yTicks.map((tick) => {
                    const y = getY(tick);
                    return (
                      <g key={tick}>
                        <line 
                          x1={paddingLeft} 
                          y1={y} 
                          x2={chartWidth - paddingRight} 
                          y2={y} 
                          stroke="rgba(255, 255, 255, 0.05)" 
                          strokeWidth="1"
                        />
                        <text 
                          x={paddingLeft - 8} 
                          y={y + 4} 
                          fill="var(--text-muted)" 
                          fontSize="10" 
                          textAnchor="end"
                          fontFamily="Outfit"
                        >
                          {tick.toFixed(1)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Curve Path Shading Fill */}
                  <path d={areaPath} fill="url(#area-grad)" />

                  {/* Curve Stroke Line */}
                  <path d={linePath} fill="none" stroke="url(#line-grad)" strokeWidth="3" />

                  {/* Nodes and Labels */}
                  {studentData.trend.map((pt, idx) => {
                    const cx = getX(idx, studentData.trend.length);
                    const cy = getY(pt.gpa);
                    
                    const isHovered = hoveredPoint?.index === idx;

                    return (
                      <g key={idx}>
                        {/* Interactive Invisible Circle for easier hovering */}
                        <circle 
                          cx={cx} 
                          cy={cy} 
                          r="15" 
                          fill="transparent" 
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={() => setHoveredPoint({ ...pt, index: idx, cx, cy })}
                          onMouseLeave={() => setHoveredPoint(null)}
                        />
                        
                        {/* Glow indicator on hover */}
                        {isHovered && (
                          <circle 
                            cx={cx} 
                            cy={cy} 
                            r="12" 
                            fill="var(--color-primary)" 
                            opacity="0.3" 
                            className="animate-pulse"
                          />
                        )}

                        {/* Visible Data Dot */}
                        <circle 
                          cx={cx} 
                          cy={cy} 
                          r={isHovered ? '6' : '4.5'} 
                          fill={isHovered ? '#fff' : 'var(--color-primary)'} 
                          stroke={isHovered ? 'var(--color-secondary)' : '#0B0F19'} 
                          strokeWidth="2" 
                          style={{ transition: 'all 0.2s ease' }}
                        />
                        
                        {/* X-axis semester Label */}
                        <text 
                          x={cx} 
                          y={chartHeight - 12} 
                          fill="var(--text-muted)" 
                          fontSize="9.5" 
                          textAnchor="middle"
                        >
                          {pt.semester}
                        </text>

                        {/* Node value label */}
                        <text 
                          x={cx} 
                          y={cy - 10} 
                          fill="#fff" 
                          fontSize="9" 
                          textAnchor="middle" 
                          fontWeight="bold"
                          fontFamily="Outfit"
                        >
                          {pt.gpa.toFixed(2)}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Floating Interactive Tooltip */}
                {hoveredPoint && (
                  <div 
                    className="chart-tooltip card-glass animate-fade-in"
                    style={{
                      position: 'absolute',
                      left: `${hoveredPoint.cx - 70}px`,
                      top: `${hoveredPoint.cy - 75}px`,
                      pointerEvents: 'none',
                      zIndex: 10,
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      background: 'rgba(11, 15, 25, 0.95)',
                      border: '1px solid var(--border-focus)',
                      boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)',
                    }}
                  >
                    <div style={{ fontWeight: 'bold', color: 'var(--color-secondary)' }}>{hoveredPoint.semester}</div>
                    <div>평점: <span style={{ color: '#fff', fontWeight: 'bold' }}>{hoveredPoint.gpa.toFixed(2)}</span></div>
                    <div>전공평점: <span style={{ color: 'var(--color-accent)' }}>{hoveredPoint.majorGpa.toFixed(2)}</span></div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Credit Audits List */}
          <div className="chart-card card-glass animate-fade-in-up" style={{ animationDelay: '150ms' }}>
            <h4>졸업 요건 정밀 감사</h4>
            <div className="audit-list">
              <div className="audit-item">
                <div className="audit-icon-wrapper success">
                  <CheckCircle size={16} />
                </div>
                <div className="audit-text">
                  <h5>기본 교양 영역 이수 상태</h5>
                  <p>기초교양 공통 9학점 이수 기준을 100% 충족하였습니다.</p>
                </div>
              </div>

              <div className="audit-item">
                <div className="audit-icon-wrapper warning">
                  <HelpCircle size={16} />
                </div>
                <div className="audit-text">
                  <h5>전공 심화 학점 이수 현황</h5>
                  <p>
                    총 60학점 중 {studentData.summary.majorCredits}학점을 이수하여, 
                    졸업까지 <strong>{studentData.summary.majorGoal - studentData.summary.majorCredits}학점</strong>의 전공 이수가 추가 필요합니다.
                  </p>
                </div>
              </div>

              <div className="audit-item">
                <div className="audit-icon-wrapper warning">
                  <HelpCircle size={16} />
                </div>
                <div className="audit-text">
                  <h5>균형/융합 선택 영역 감사</h5>
                  <p>
                    {studentType === 'transfer' 
                      ? '융합교양 3영역(기술과 인류)에서 3학점 미이수 상태가 검증되었습니다. 시간표 포털에서 AI 설계를 통해 신청하세요.' 
                      : studentType === 'general'
                      ? '균형교양 4영역(예술과 현대생활)에서 3학점이 누락되어 수강 설계가 요구됩니다.'
                      : '경영전공 필수 마케팅원론(3학점) 미이수로 졸업 요건 경고가 유지되고 있습니다.'
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Split Layout: AI consulting and Self-Diagnosis */}
        <div className="consulting-section-split animate-fade-in-up" style={{ animationDelay: '180ms', marginTop: '24px', marginBottom: '24px' }}>
          
          {/* Left Panel: AI Consulting Card */}
          <section className="ai-consulting-card card-glass" style={{ margin: 0 }}>
            <div className="card-header-with-badge">
              <div className="title-area">
                <Sparkles className="icon-glow text-purple" size={20} />
                <h4>성적표 이미지 분석 및 AI 재수강 컨설팅</h4>
              </div>
              <span className="premium-badge">AI 실시간 진단</span>
            </div>

            <div className="consulting-content">
              {!isUploading && !analysisResult ? (
                // Default Dropzone State
                <div 
                  className="upload-dropzone"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current.click()}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept="image/*" 
                    style={{ display: 'none' }} 
                  />
                  <UploadCloud className="upload-icon" size={48} />
                  <h5>성적표 캡처본 이미지를 드래그하거나 클릭하여 업로드</h5>
                  <p>취득 평점(GPA) 및 개별 과목 등급(C+ 등)을 분석하여 재수강 전략을 제안합니다.</p>
                  <button className="btn-upload-trigger">성적표 사진 찾기</button>
                </div>
              ) : isUploading ? (
                // Scanning / Processing State
                <div className="scanning-container">
                  <div className="scanner-glow-bar"></div>
                  <div className="spinner-wrapper">
                    <Loader2 className="animate-spin text-purple" size={36} />
                  </div>
                  <h5>{loadingStage}</h5>
                  <p className="scanner-subtext">AI 기반 광학 문자 인식(OCR) 판독 알고리즘이 성적표를 매핑하고 있습니다.</p>
                </div>
              ) : (
                // Results Display State
                <div className="analysis-result-panel animate-fade-in">
                  <div className="result-grid">
                    {/* Left Column: Grades Extracted */}
                    <div className="result-left-col">
                      <div className="section-title-sm">
                        <FileText size={14} />
                        <span>성적표 OCR 추출 등급 내역 ({analysisResult.studentName}님)</span>
                      </div>
                      <div className="grades-extracted-list">
                        {analysisResult.extractedGrades.map((gradeItem, index) => {
                          const isCPlus = gradeItem.grade === 'C+';
                          return (
                            <div key={index} className={`grade-item-row ${isCPlus ? 'highlight-low' : ''}`}>
                              <span className="course-name">{gradeItem.course}</span>
                              <div className="course-meta">
                                <span className="course-type">{gradeItem.type}</span>
                                <span className="course-credit">{gradeItem.credit}학점</span>
                                <span className={`course-grade-badge ${gradeItem.grade === 'A+' || gradeItem.grade === 'A0' ? 'grade-a' : isCPlus ? 'grade-c' : 'grade-b'}`}>
                                  {gradeItem.grade}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="gpa-summary-box">
                        <span>추출된 누적 전체 평점 (GPA): </span>
                        <strong className="text-purple">{analysisResult.overallGpa} / 4.50</strong>
                      </div>
                    </div>

                    {/* Right Column: AI Advisory Report */}
                    <div className="result-right-col">
                      <div className={`advisory-banner ${analysisResult.advisory.recommendRetake ? 'recommend-yes' : 'recommend-no'}`}>
                        <div className="banner-title-area">
                          {analysisResult.advisory.recommendRetake ? (
                            <AlertTriangle className="banner-icon animate-pulse" size={20} />
                          ) : (
                            <CheckCircle2 className="banner-icon" size={20} />
                          )}
                          <h5>{analysisResult.advisory.title}</h5>
                        </div>
                        <p className="advisory-message">{getDynamicText(analysisResult.advisory.message)}</p>
                      </div>

                      <div className="advisory-actions">
                        <div className="bullet-tips">
                          <div className="tip-item">
                            <span className="tip-dot"></span>
                            <span>재수강 대상 과목: <strong>{analysisResult.advisory.targetCourse}</strong> ({analysisResult.extractedGrades.find(g => g.course === analysisResult.advisory.targetCourse)?.grade || 'C+'})</span>
                          </div>
                          <div className="tip-item">
                            <span className="tip-dot"></span>
                            <span>진단 평점 수준: {analysisResult.advisory.gpaStatus === 'high' ? '상위 10% 이내 우수' : analysisResult.advisory.gpaStatus === 'medium' ? '평균선 유지' : '보완 및 집중 관리 요함'}</span>
                          </div>
                        </div>

                        <button onClick={resetAnalysis} className="btn-reset-analysis">
                          <RefreshCw size={14} />
                          <span>다른 성적표 분석하기</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Right Panel: 자가진단 결과 상세 */}
          <section className="self-diagnosis-right-panel card-glass">
            <div className="self-diagnosis-header">
              <GraduationCap className="icon-glow text-indigo" size={20} />
              <h4>자가진단 결과 상세</h4>
            </div>

            <div className="diagnosis-grid">
              {/* Card 1: 졸업불가 */}
              <div className="diagnosis-item-card danger-left">
                <span className="diag-type" style={{ color: '#ef4444' }}>졸업불가</span>
                <h5 className="diag-title">졸업학점 부족({user && user.studentId === '2025080081' ? '2.5' : studentType === 'transfer' ? '5.0' : studentType === 'double-major' ? '12.0' : '1.5'}학점 부족)</h5>
              </div>

              {/* Card 2: 수료가능 */}
              <div className="diagnosis-item-card danger-left">
                <span className="diag-type" style={{ color: '#ef4444' }}>수료가능</span>
                <h5 className="diag-title">
                  {user && user.studentId === '2025080081' 
                    ? '졸업평가 불합격(경영정보학과)' 
                    : studentType === 'transfer' 
                    ? '졸업평가 합격' 
                    : '졸업평가 불합격'
                  }
                </h5>
              </div>

              {/* Card 3: 추가정보 (교양합계) */}
              <div className="diagnosis-item-card info-left">
                <span className="diag-type" style={{ color: '#3b82f6' }}>추가정보</span>
                <h5 className="diag-title">
                  {user && user.studentId === '2025080081' || studentType === 'transfer'
                    ? '교양합계로만 체크(40)'
                    : '교양 영역별 균형 체크 필수'
                  }
                </h5>
              </div>

              {/* Card 4: 추가정보 (마이크로디그리) */}
              <div className="diagnosis-item-card info-left">
                <span className="diag-type" style={{ color: '#3b82f6' }}>추가정보</span>
                <h5 className="diag-title">
                  {user && user.studentId === '2025080081' 
                    ? '마이크로디그리 대상자' 
                    : '마이크로디그리 미신청'
                  }
                </h5>
              </div>

              {/* Card 5: 추가정보 (트랙제) */}
              <div className="diagnosis-item-card info-left">
                <span className="diag-type" style={{ color: '#3b82f6' }}>추가정보</span>
                <h5 className="diag-title">트랙제 대상자</h5>
              </div>
            </div>
          </section>
        </div>

        {/* Semester-by-semester Grade History Table */}
        <section className="table-card card-glass animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <div className="table-header">
            <h4>학기별 성적 상세 내역</h4>
          </div>
          
          <div className="table-wrapper">
            <table className="grade-table">
              <thead>
                <tr>
                  <th>이수 학기</th>
                  <th>평점 (GPA)</th>
                  <th>전공 평점</th>
                  <th>취득 학점</th>
                  <th>전공 이수 학점</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {studentData.semesters.map((sem) => (
                  <tr key={sem.id}>
                    <td className="sem-title">{sem.title}</td>
                    <td className="gpa-val font-outfit">{sem.gpa}</td>
                    <td className="gpa-val font-outfit text-accent">{sem.majorGpa}</td>
                    <td className="font-outfit">{sem.earned}학점</td>
                    <td className="font-outfit">{sem.majorEarned}학점</td>
                    <td>
                      {sem.remark !== '-' ? (
                        <span className="table-badge-remark">{sem.remark}</span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="portal-footer">
        <p>© 2026 경상국립대학교 AI 학업 네비게이터 시스템 (GNU AI Navigator)</p>
      </footer>
    </div>
  );
}

export default CreditAnalytics;
