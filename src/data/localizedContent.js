export const localizedContent = {
  en: {
    languageLabel: 'English',
    header: {
      ariaLabel: 'NoticePilot workspace',
      tagline: 'Turn long university notices into checklists and calendar events.',
      navCta: 'Try mock analysis',
    },
    workspaceTabs: {
      ariaLabel: 'Workspace tabs',
      items: [
        { id: 'calendar', href: '#calendar', label: 'Notice calendar' },
        { id: 'analyze', href: '#analyze', label: 'Single notice analysis' },
      ],
    },
    calendarPage: {
      campusPreference: {
        title: 'Campus preferences',
        subtitle: 'Kangwon National University',
        description:
          'Selected campuses will be used later for notice filtering and subscription calendar conditions.',
        groupLabel: 'Campus selection',
        campuses: [
          { id: 'chuncheon', label: 'Chuncheon' },
          { id: 'samcheok', label: 'Samcheok' },
          { id: 'dogye', label: 'Dogye' },
          { id: 'gangneung_wonju', label: 'Gangneung-Wonju' },
        ],
        saveStatus: {
          default: 'Changed settings are automatically saved in this browser.',
          successLabel: 'Saved',
          successDetail: 'Campus preferences were updated.',
          failure: 'Settings could not be saved in this browser.',
        },
        commonNoticePolicy:
          'Common notices for all campuses are included automatically.',
      },
      subscriptionIcs: {
        title: 'Reference subscription calendar',
        description:
          'Create a temporary capability URL for the fixed all-campus reference feed.',
        badges: {
          idle: 'Not created',
          provisioning: 'Creating',
          ready: 'Ready',
          unavailable: 'Unavailable / disabled',
        },
        idleBody:
          'The URL is created only for this page session and is not saved in your browser.',
        provisionButton: 'Create reference subscription URL',
        provisioningButton: 'Creating reference URL…',
        provisioningStatus: 'Provisioning the reference subscription feed…',
        retryButton: 'Try again',
        unavailableTitle: 'Reference feed unavailable.',
        unavailableBody:
          'The server may have this feature disabled or may be temporarily unavailable.',
        details: {
          calendarName: 'Calendar name',
          eventCount: 'Reference events',
          tokenPrefix: 'Token prefix',
          subscriptionUrl: 'Subscription URL',
          subscriptionPath: 'Server path',
        },
        eventCount: (count) => `${count.toLocaleString('en-US')} events`,
        copyButton: 'Copy subscription URL',
        createNewButton: 'Create a new URL',
        copyUnavailable: 'Clipboard unavailable',
        copySuccess: 'Subscription URL copied.',
        copyFailure:
          'The URL could not be copied. Select the URL above and copy it manually.',
        expirationWarningTitle: 'Temporary access:',
        expirationWarning:
          'This capability URL and token expire when the server restarts. Create a new URL after a restart.',
        referenceScopeTitle: 'Reference scope:',
        referenceScope:
          'This fixed all-campus reference feed ignores the campus preferences saved in this browser.',
      },
    },
    collectionLabels: {
      deadlines: 'Deadline',
      tasks: 'Task',
      submissions: 'Submission',
      requirements: 'Requirement',
      cautions: 'Caution',
      calendarEvents: 'Calendar event',
    },
    noticeInput: {
      eyebrow: 'Manual input',
      title: 'Paste a notice',
      description:
        'Paste text, upload a TXT / MD file, or load the sample notice. Confirm or edit the extracted text before analysis.',
      fileUploadLabel: 'Upload TXT / MD file',
      extractPreviewTitle: 'Extract preview',
      uploadedFileName: (fileName) => `Loaded file: ${fileName}`,
      noUploadedFile: 'No file loaded. Manual paste is still available.',
      extractPreviewHint:
        'Uploaded text stays in the editable notice text field and is not analyzed automatically.',
      privacyNoticeTitle: 'Privacy check',
      privacyNoticeBody:
        'Do not paste or upload notices that contain sensitive personal information. NoticePilot only flags simple patterns in the browser and does not mask text automatically.',
      warningTitle: 'Review before analysis',
      titleLabel: 'Notice title',
      titlePlaceholder: 'Scholarship notice, assignment guideline, job posting...',
      noticeTypeLabel: 'Notice type (optional)',
      noticeTypePlaceholder: 'Select notice type',
      noticeTypeOptions: [
        { value: 'school_notice', label: 'School notice' },
        { value: 'assignment', label: 'Assignment' },
        { value: 'scholarship', label: 'Scholarship' },
        { value: 'competition', label: 'Competition' },
        { value: 'job_posting', label: 'Job posting' },
        { value: 'other', label: 'Other' },
      ],
      publicationDateLabel: 'Publication date (optional)',
      textLabel: 'Notice text',
      textPlaceholder:
        'Paste a university notice, assignment guideline, scholarship announcement, competition notice, or job posting here.',
      analyzeButton: 'Analyze mock notice',
      analyzeServerButton: 'Analyze via server mock',
      serverAnalyzeLoading: 'Analyzing via server...',
      clearButton: 'Clear',
    },
    emptyState: {
      eyebrow: 'No analysis yet',
      title: 'Load the mock result to inspect the MVP workflow.',
      body: 'The first pass focuses on review, editing, source evidence, and export behavior without backend or AI integration.',
    },
    dashboard: {
      eyebrow: 'Mock analysis',
      warningTitle: 'Warnings to review',
      showEvidenceReview: 'Review all evidence',
      hideEvidenceReview: 'Hide evidence review',
      evidenceReview: {
        title: 'Evidence review',
        fallback: 'No evidence provided.',
      },
      sections: {
        deadlines: 'Deadlines',
        tasks: 'Tasks',
        submissions: 'Required submissions',
        requirements: 'Eligibility requirements',
        cautions: 'Cautions',
        calendarEvents: 'Calendar event candidates',
      },
    },
    card: {
      title: 'Title',
      requirement: 'Requirement',
      caution: 'Caution',
      evidence: 'Evidence',
      delete: 'Delete',
      taskComplete: 'Task complete',
      selectForCalendar: 'Select for calendar export',
      date: 'Date',
      time: 'Time',
      dueDate: 'Due date',
      startDate: 'Start date',
      allDay: 'All-day event',
      description: 'Description',
      edited: 'Edited',
    },
    evidencePanel: {
      eyebrow: 'Source evidence',
      title: 'Review before trusting',
      empty:
        'Select Evidence on any extracted item to compare it with the source notice text.',
      fallback: 'No evidence provided.',
    },
    exportPanel: {
      eyebrow: 'Export',
      title: 'Checklist output',
      markdownButton: 'Download Markdown',
      icsButton: 'Download .ics',
      includeEvidence: 'Include evidence in Markdown',
      exportErrorTitle: 'Export blocked',
      note: 'Markdown export includes the reviewed checklist. Calendar export downloads selected all-day events with valid start dates.',
      fileName: 'noticepilot-checklist.md',
      icsFileName: 'noticepilot-calendar.ics',
      noValidEvents:
        'Select at least one calendar event with a valid start date before downloading .ics.',
    },
    markdown: {
      fallbackTitle: 'NoticePilot Checklist',
      unavailable: '# NoticePilot Checklist\n\nNo analysis result is available yet.\n',
      deadlines: 'Deadlines',
      tasks: 'Tasks',
      submissions: 'Required Submissions',
      requirements: 'Eligibility Requirements',
      cautions: 'Cautions',
      noDeadlines: 'No deadlines extracted.',
      noTasks: 'No tasks extracted.',
      noSubmissions: 'No submissions extracted.',
      noRequirements: 'No requirements extracted.',
      noCautions: 'No cautions extracted.',
      evidence: 'Evidence',
    },
    errors: {
      fileErrorTitle: 'File cannot be used',
      unsupportedFile: 'Only .txt and .md files are supported for this MVP.',
      fileTooLarge: 'File is too large. Please upload a TXT or MD file under 1MB.',
      fileReadFailed: 'The file could not be read. Please try another TXT or MD file.',
      serverAnalyze: {
        title: 'Server mock analysis failed',
        network:
          'The local analyze server is unavailable. Start it with npm run dev:server and try again.',
        generic:
          'The server mock analysis could not be completed. Please try again.',
        unsupportedMode:
          'The analyze server rejected the requested analysis mode.',
        aiNotImplemented:
          'Real AI analysis is not enabled in this MVP. Use mock analysis instead.',
        invalidResponse:
          'The analyze server returned an invalid or empty response.',
      },
    },
    warnings: {
      privacyPatternsDetected: (types) =>
        `Possible sensitive personal information detected (${types.join(', ')}). Review the text before continuing.`,
    },
    validationWarnings: {
      normalizedFields: (sectionName) =>
        `${sectionName} was missing or invalid and was normalized.`,
      sectionLimitApplied: (sectionName, limit) =>
        `${sectionName} was trimmed to the MVP limit of ${limit} items.`,
      duplicatesRemoved: (count) =>
        `${count} duplicate calendar event${count === 1 ? '' : 's'} removed.`,
    },
    confirmations: {
      overwrite: {
        title: 'Replace current analysis?',
        message:
          'A notice analysis is already active. Loading a new mock analysis will replace the current result and calendar selection state.',
        confirm: 'Replace',
        cancel: 'Cancel',
      },
      privacy: {
        title: 'Continue with possible personal information?',
        message:
          'NoticePilot detected possible email, phone, or resident-registration-number-like text. Review the notice before continuing.',
        confirm: 'Continue',
        cancel: 'Cancel',
      },
    },
    intro: {
      overview: {
        eyebrow: 'NoticePilot',
        title:
          'Turn long university notices into actionable checklists and calendar events.',
        body: 'NoticePilot is a React + Express web app for university students. It helps users process notices, assignment guidelines, scholarships, competition announcements, and job postings by extracting deadlines, submissions, requirements, cautions, and calendar event candidates.',
      },
      problem: {
        title: 'Problem',
        body: 'University students frequently read long and scattered notices. Important details are often buried inside paragraphs, forcing students to manually identify tasks, submissions, deadlines, and cautions.',
        cards: [
          'Long notices are difficult to scan.',
          'Deadlines are easy to miss.',
          'Required documents can be overlooked.',
          'Eligibility conditions are often unclear.',
          'Manual calendar entry is inconvenient.',
        ],
      },
      solution: {
        title: 'Solution',
        body: 'NoticePilot converts long notices into structured, actionable information. It extracts what users need to do, when to do it, what to submit, and which dates should become calendar events.',
        flow: ['Paste notice', 'AI extraction', 'User review', 'Checklist', '.ics export'],
      },
      useCases: {
        title: 'Use Cases',
        items: [
          'School notice: Extract academic schedules and required actions.',
          'Assignment guideline: Extract deadline, format, grading criteria, and cautions.',
          'Scholarship announcement: Extract eligibility, required documents, and deadline.',
          'Competition notice: Extract submission period, required files, and result announcement date.',
          'Job posting: Extract requirements, documents, and application deadline.',
        ],
      },
      features: {
        title: 'Core Features',
        items: [
          'Notice text input',
          'AI-powered structured extraction',
          'Deadline extraction',
          'Action item checklist',
          'Required submission list',
          'Eligibility requirement detection',
          'Caution extraction',
          'Source evidence display',
          'Editable result cards',
          '.ics calendar export',
          'Markdown checklist export',
        ],
      },
      scope: {
        title: 'MVP Scope',
        columns: [
          {
            title: 'Must-have',
            items: [
              'Manual notice text input',
              'AI analysis',
              'Deadline extraction',
              'Task extraction',
              'Required submission extraction',
              'Requirement extraction',
              'Caution extraction',
              'Editable result cards',
              'Markdown export',
            ],
          },
          {
            title: 'Should-have',
            items: [
              '.ics export',
              'Multiple events in one .ics file',
              'Calendar event selection',
              'Source evidence display',
              'TXT / MD upload',
            ],
          },
          {
            title: 'Later',
            items: [
              'Full HWP support',
              'Image OCR',
              'Login',
              'Google Calendar API integration',
              'Push notifications',
            ],
          },
        ],
      },
      techStack: {
        title: 'Tech Stack',
        items: [
          'Frontend: React + Vite',
          'Backend: Express',
          'State: React useState',
          'Persistence: localStorage',
          'Export: Client-side .ics and Markdown generation',
          'AI: Server-side AI API call through Express',
        ],
        note: 'The AI API key should never be exposed in the browser. Express will handle AI API requests in a later pass.',
      },
      demo: {
        title: 'Demo Example',
        inputTitle: 'Sample input',
        input:
          'Applications for the 2026 fall semester scholarship must be submitted online by July 20, 2026 at 18:00. Applicants must submit a transcript and a personal statement. Only students who completed at least 12 credits in the previous semester are eligible.',
        outputTitle: 'Expected output',
        output: [
          'Deadline: Scholarship application deadline',
          'Tasks: Apply online, prepare transcript, write statement',
          'Submissions: Transcript, personal statement',
          'Requirement: Completed at least 12 credits',
          'Caution: Missing documents may exclude the application',
        ],
      },
      finalStatement: {
        title: 'Final Product Statement',
        body: 'NoticePilot helps university students turn long notices, assignment guidelines, scholarship announcements, competition notices, and job postings into actionable checklists and .ics calendar events.',
      },
    },
  },
  ko: {
    languageLabel: '한국어',
    header: {
      ariaLabel: 'NoticePilot 작업 영역',
      tagline: '긴 대학 공지를 체크리스트와 캘린더 일정으로 바꿉니다.',
      navCta: '샘플 분석하기',
    },
    workspaceTabs: {
      ariaLabel: '작업 영역 탭',
      items: [
        { id: 'calendar', href: '#calendar', label: '공지 캘린더' },
        { id: 'analyze', href: '#analyze', label: '단건 공지 분석' },
      ],
    },
    calendarPage: {
      campusPreference: {
        title: '관심 캠퍼스 설정',
        subtitle: '강원대학교 기준',
        description:
          '선택한 캠퍼스는 이후 공지 필터링과 구독형 캘린더 조건에 사용됩니다.',
        groupLabel: '캠퍼스 선택',
        campuses: [
          { id: 'chuncheon', label: '춘천' },
          { id: 'samcheok', label: '삼척' },
          { id: 'dogye', label: '도계' },
          { id: 'gangneung_wonju', label: '강릉원주' },
        ],
        saveStatus: {
          default: '변경한 설정은 이 브라우저에 자동 저장됩니다.',
          successLabel: '저장됨',
          successDetail: '관심 캠퍼스 설정이 업데이트되었습니다.',
          failure: '설정을 이 브라우저에 저장하지 못했습니다.',
        },
        commonNoticePolicy:
          '모든 캠퍼스에 해당하는 공통 공지는 자동 포함됩니다.',
      },
      subscriptionIcs: {
        title: '참조용 구독 캘린더',
        description:
          '모든 캠퍼스를 포함하는 고정 참조 피드의 임시 기능 URL을 만듭니다.',
        badges: {
          idle: '생성 전',
          provisioning: '생성 중',
          ready: '사용 가능',
          unavailable: '사용 불가 / 비활성화',
        },
        idleBody:
          'URL은 현재 페이지 세션에서만 생성되며 브라우저에 저장되지 않습니다.',
        provisionButton: '참조용 구독 URL 생성',
        provisioningButton: '참조 URL 생성 중…',
        provisioningStatus: '참조용 구독 피드를 준비하고 있습니다…',
        retryButton: '다시 시도',
        unavailableTitle: '참조 피드를 사용할 수 없습니다.',
        unavailableBody:
          '서버에서 이 기능을 비활성화했거나 일시적으로 사용할 수 없을 수 있습니다.',
        details: {
          calendarName: '캘린더 이름',
          eventCount: '참조 일정',
          tokenPrefix: '토큰 앞부분',
          subscriptionUrl: '구독 URL',
          subscriptionPath: '서버 경로',
        },
        eventCount: (count) => `${count.toLocaleString('ko-KR')}개 일정`,
        copyButton: '구독 URL 복사',
        createNewButton: '새 URL 생성',
        copyUnavailable: '클립보드 사용 불가',
        copySuccess: '구독 URL을 복사했습니다.',
        copyFailure:
          'URL을 복사하지 못했습니다. 위 URL을 선택해 직접 복사해 주세요.',
        expirationWarningTitle: '임시 접근:',
        expirationWarning:
          '이 기능 URL과 토큰은 서버가 재시작되면 만료됩니다. 재시작 후 새 URL을 생성하세요.',
        referenceScopeTitle: '참조 범위:',
        referenceScope:
          '이 고정형 전체 캠퍼스 참조 피드는 브라우저에 저장된 관심 캠퍼스 설정을 무시합니다.',
      },
    },
    collectionLabels: {
      deadlines: '마감일',
      tasks: '할 일',
      submissions: '제출물',
      requirements: '지원 조건',
      cautions: '주의사항',
      calendarEvents: '캘린더 일정',
    },
    noticeInput: {
      eyebrow: '수동 입력',
      title: '공지 붙여넣기',
      description:
        '공지 텍스트를 붙여넣거나 TXT / MD 파일을 업로드하거나 샘플을 불러오세요. 분석 전 추출된 텍스트를 확인하고 수정합니다.',
      fileUploadLabel: 'TXT / MD 파일 업로드',
      extractPreviewTitle: '추출 미리보기',
      uploadedFileName: (fileName) => `불러온 파일: ${fileName}`,
      noUploadedFile: '불러온 파일이 없습니다. 직접 붙여넣기도 사용할 수 있습니다.',
      extractPreviewHint:
        '업로드한 텍스트는 수정 가능한 공지 본문 입력란에 표시되며 자동으로 분석되지 않습니다.',
      privacyNoticeTitle: '개인정보 확인',
      privacyNoticeBody:
        '민감한 개인정보가 포함된 문서는 붙여넣거나 업로드하지 마세요. NoticePilot은 브라우저에서 단순 패턴만 감지하며 텍스트를 자동으로 마스킹하지 않습니다.',
      warningTitle: '분석 전 확인',
      titleLabel: '공지 제목',
      titlePlaceholder: '장학금 공지, 과제 안내, 채용 공고...',
      noticeTypeLabel: '공지 유형 (선택)',
      noticeTypePlaceholder: '공지 유형 선택',
      noticeTypeOptions: [
        { value: 'school_notice', label: '학사 공지' },
        { value: 'assignment', label: '과제' },
        { value: 'scholarship', label: '장학금' },
        { value: 'competition', label: '공모전' },
        { value: 'job_posting', label: '채용 공고' },
        { value: 'other', label: '기타' },
      ],
      publicationDateLabel: '공지 게시일 (선택)',
      textLabel: '공지 본문',
      textPlaceholder:
        '대학 공지, 과제 지침, 장학금 안내, 공모전 공지, 채용 공고를 여기에 붙여넣으세요.',
      analyzeButton: '샘플 공지 분석',
      analyzeServerButton: '서버 mock 분석',
      serverAnalyzeLoading: '서버 mock 분석 중...',
      clearButton: '초기화',
    },
    emptyState: {
      eyebrow: '아직 분석 결과가 없습니다',
      title: '샘플 결과를 불러와 MVP 흐름을 확인하세요.',
      body: '이번 첫 구현은 백엔드나 AI 연동 없이 검토, 수정, 근거 확인, 내보내기 흐름에 집중합니다.',
    },
    dashboard: {
      eyebrow: '샘플 분석',
      warningTitle: '확인할 경고',
      showEvidenceReview: '전체 근거 검토',
      hideEvidenceReview: '근거 검토 닫기',
      evidenceReview: {
        title: '전체 근거 검토',
        fallback: '제공된 근거가 없습니다.',
      },
      sections: {
        deadlines: '마감일',
        tasks: '할 일',
        submissions: '필수 제출물',
        requirements: '지원 조건',
        cautions: '주의사항',
        calendarEvents: '캘린더 일정 후보',
      },
    },
    card: {
      title: '제목',
      requirement: '조건',
      caution: '주의사항',
      evidence: '근거 보기',
      delete: '삭제',
      taskComplete: '완료 처리',
      selectForCalendar: '캘린더 내보내기에 포함',
      date: '날짜',
      time: '시간',
      dueDate: '마감일',
      startDate: '시작일',
      allDay: '종일 일정',
      description: '설명',
      edited: '수정됨',
    },
    evidencePanel: {
      eyebrow: '원문 근거',
      title: 'AI 결과를 검토하세요',
      empty:
        '추출 항목의 근거 보기를 선택하면 원문에서 어떤 문장을 기준으로 추출했는지 확인할 수 있습니다.',
      fallback: '제공된 근거가 없습니다.',
    },
    exportPanel: {
      eyebrow: '내보내기',
      title: '체크리스트 출력',
      markdownButton: 'Markdown 다운로드',
      icsButton: '.ics 다운로드',
      includeEvidence: 'Markdown에 근거 포함',
      exportErrorTitle: '내보내기 차단',
      note: 'Markdown은 검토한 체크리스트를 내려받습니다. 캘린더 내보내기는 선택된 종일 일정 중 시작일이 유효한 항목만 포함합니다.',
      fileName: 'noticepilot-checklist-ko.md',
      icsFileName: 'noticepilot-calendar-ko.ics',
      noValidEvents:
        '.ics를 다운로드하려면 시작일이 유효한 캘린더 일정을 하나 이상 선택하세요.',
    },
    markdown: {
      fallbackTitle: 'NoticePilot 체크리스트',
      unavailable: '# NoticePilot 체크리스트\n\n아직 분석 결과가 없습니다.\n',
      deadlines: '마감일',
      tasks: '할 일',
      submissions: '필수 제출물',
      requirements: '지원 조건',
      cautions: '주의사항',
      noDeadlines: '추출된 마감일이 없습니다.',
      noTasks: '추출된 할 일이 없습니다.',
      noSubmissions: '추출된 제출물이 없습니다.',
      noRequirements: '추출된 지원 조건이 없습니다.',
      noCautions: '추출된 주의사항이 없습니다.',
      evidence: '근거',
    },
    errors: {
      fileErrorTitle: '파일을 사용할 수 없습니다',
      unsupportedFile: '이번 MVP에서는 .txt와 .md 파일만 지원합니다.',
      fileTooLarge: '파일이 너무 큽니다. 1MB 이하의 TXT 또는 MD 파일을 업로드하세요.',
      fileReadFailed: '파일을 읽을 수 없습니다. 다른 TXT 또는 MD 파일을 다시 시도하세요.',
      serverAnalyze: {
        title: '서버 mock 분석 실패',
        network:
          '로컬 분석 서버에 연결할 수 없습니다. npm run dev:server로 서버를 실행한 뒤 다시 시도하세요.',
        generic: '서버 mock 분석을 완료할 수 없습니다. 다시 시도하세요.',
        unsupportedMode: '분석 서버가 요청한 분석 모드를 거부했습니다.',
        aiNotImplemented:
          '이번 MVP에서는 실제 AI 분석이 활성화되어 있지 않습니다. mock 분석을 사용하세요.',
        invalidResponse: '분석 서버가 비어 있거나 올바르지 않은 응답을 반환했습니다.',
      },
    },
    warnings: {
      privacyPatternsDetected: (types) =>
        `민감한 개인정보로 보일 수 있는 패턴이 감지되었습니다(${types.join(', ')}). 계속하기 전에 본문을 확인하세요.`,
    },
    validationWarnings: {
      normalizedFields: (sectionName) =>
        `${sectionName} 섹션이 없거나 올바르지 않아 기본값으로 정리했습니다.`,
      sectionLimitApplied: (sectionName, limit) =>
        `${sectionName} 섹션을 MVP 제한인 ${limit}개 항목으로 줄였습니다.`,
      duplicatesRemoved: (count) => `중복 캘린더 일정 ${count}개를 제거했습니다.`,
    },
    confirmations: {
      overwrite: {
        title: '현재 분석 결과를 교체할까요?',
        message:
          '이미 활성화된 공지 분석 결과가 있습니다. 새 샘플 분석을 불러오면 현재 결과와 캘린더 선택 상태가 교체됩니다.',
        confirm: '교체',
        cancel: '취소',
      },
      privacy: {
        title: '개인정보 가능성이 있는 본문으로 계속할까요?',
        message:
          '이메일, 전화번호 또는 주민등록번호와 유사한 텍스트가 감지되었습니다. 계속하기 전에 공지 본문을 확인하세요.',
        confirm: '계속',
        cancel: '취소',
      },
    },
    intro: {
      overview: {
        eyebrow: 'NoticePilot',
        title: '긴 대학 공지를 실행 가능한 체크리스트와 캘린더 일정으로 바꿉니다.',
        body: 'NoticePilot은 대학생을 위한 React + Express 웹앱입니다. 긴 공지, 과제 지침, 장학금 안내, 공모전 공지, 채용 공고에서 마감일, 제출물, 지원 조건, 할 일, 주의사항, 캘린더 일정 후보를 추출합니다.',
      },
      problem: {
        title: '문제 정의',
        body: '대학생은 길고 흩어진 공지를 자주 확인해야 합니다. 마감일, 제출 서류, 지원 조건, 주의사항이 문단 안에 묻혀 있어 직접 할 일과 일정을 정리해야 합니다.',
        cards: [
          '긴 공지는 빠르게 훑어보기 어렵습니다.',
          '중요한 마감일을 놓치기 쉽습니다.',
          '필수 제출물이 누락될 수 있습니다.',
          '지원 조건이 명확히 보이지 않는 경우가 많습니다.',
          '캘린더에 일정을 직접 옮기는 과정이 번거롭습니다.',
        ],
      },
      solution: {
        title: '해결 아이디어',
        body: 'NoticePilot은 긴 공지를 구조화된 실행 정보로 변환합니다. 단순 요약이 아니라 사용자가 무엇을 해야 하는지, 언제 해야 하는지, 무엇을 제출해야 하는지, 어떤 날짜를 캘린더에 넣어야 하는지 추출합니다.',
        flow: ['공지 붙여넣기', 'AI 추출', '사용자 검토', '체크리스트', '.ics 내보내기'],
      },
      useCases: {
        title: '사용 시나리오',
        items: [
          '학사 공지: 학사 일정과 필요한 행동을 추출합니다.',
          '과제 지침: 마감일, 제출 형식, 평가 기준, 주의사항을 추출합니다.',
          '장학금 안내: 지원 조건, 제출 서류, 신청 마감일을 추출합니다.',
          '공모전 공지: 접수 기간, 제출 파일, 결과 발표일을 추출합니다.',
          '채용 공고: 지원 조건, 제출 서류, 지원 마감일을 추출합니다.',
        ],
      },
      features: {
        title: '핵심 기능',
        items: [
          '공지 본문 입력',
          'AI 기반 구조화 추출',
          '마감일 추출',
          '할 일 체크리스트',
          '필수 제출물 목록',
          '지원 조건 탐지',
          '주의사항 추출',
          '원문 근거 표시',
          '수정 가능한 결과 카드',
          '.ics 캘린더 내보내기',
          'Markdown 체크리스트 내보내기',
        ],
      },
      scope: {
        title: 'MVP 범위',
        columns: [
          {
            title: '필수',
            items: [
              '수동 공지 입력',
              'AI 분석',
              '마감일 추출',
              '할 일 추출',
              '필수 제출물 추출',
              '지원 조건 추출',
              '주의사항 추출',
              '수정 가능한 결과 카드',
              'Markdown 내보내기',
            ],
          },
          {
            title: '우선 구현 후보',
            items: [
              '.ics 내보내기',
              '여러 일정을 하나의 .ics 파일로 내보내기',
              '캘린더 일정 선택',
              '원문 근거 표시',
              'TXT / MD 업로드',
            ],
          },
          {
            title: '나중에',
            items: [
              'HWP 전체 지원',
              '이미지 OCR',
              '로그인',
              'Google Calendar API 연동',
              '푸시 알림',
            ],
          },
        ],
      },
      techStack: {
        title: '기술 스택',
        items: [
          'Frontend: React + Vite',
          'Backend: Express',
          'State: React useState',
          'Persistence: localStorage',
          'Export: 클라이언트 측 .ics 및 Markdown 생성',
          'AI: Express 서버를 통한 서버 측 AI API 호출',
        ],
        note: 'AI API 키는 브라우저에 노출되면 안 됩니다. 다음 단계에서 Express가 AI API 요청을 처리하도록 구성합니다.',
      },
      demo: {
        title: '데모 예시',
        inputTitle: '샘플 입력',
        input:
          '2026학년도 2학기 장학금 신청은 2026년 7월 20일 18:00까지 온라인으로 제출해야 합니다. 신청자는 성적증명서와 자기소개서를 제출해야 하며, 직전 학기 12학점 이상 이수한 학생만 지원할 수 있습니다.',
        outputTitle: '예상 출력',
        output: [
          '마감일: 장학금 신청 마감',
          '할 일: 온라인 신청, 성적증명서 준비, 자기소개서 작성',
          '제출물: 성적증명서, 자기소개서',
          '지원 조건: 직전 학기 12학점 이상 이수',
          '주의사항: 서류 누락 시 심사에서 제외될 수 있음',
        ],
      },
      finalStatement: {
        title: '최종 제품 설명',
        body: 'NoticePilot은 대학생이 긴 공지, 과제 지침, 장학금 안내, 공모전 공지, 채용 공고를 실행 가능한 체크리스트와 .ics 캘린더 일정으로 바꿀 수 있게 돕는 웹앱입니다.',
      },
    },
  },
}
